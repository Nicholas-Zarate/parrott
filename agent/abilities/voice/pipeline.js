/**
 * Voice session pipeline: when listening is on, receive speech → STT → LLM → TTS → save turns.
 * Single in-flight turn per session; post start/stop and introspection to session text channel.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getToolsCalledFromSteps } = require('../../database/supabase/conversation-history');
const { insertVoiceSessionTurn } = require('../../database/supabase/voice-sessions');
const { chatWithTools } = require('../../ai-sdk/with-tools');
const parrotConfig = require('../../config/parrot');
const { playInSession } = require('./play');
const { transcribeFromFile } = require('./stt');
const { appendAndCompress } = require('./rolling-buffer');
const { PARROTT_TRIGGER_REGEX, extractAfterTrigger } = require('./keyword-trigger');

const LOG_PREFIX = '[Voice pipeline]';

/** Discord voice receive is 48 kHz mono. FFmpeg cannot read raw Opus frames; we decode to PCM then convert. */
const OPUS_SAMPLE_RATE = 48000;
const OPUS_CHANNELS = 1;
const MIN_PCM_BYTES = 8000; // ~50ms at 48kHz s16le mono; avoid empty/short files

/** Max time to wait for voice stream to end (silence) before giving up. Shorter = faster reply when Discord never sends stream end. Default 6s; set VOICE_STREAM_TIMEOUT_MS to override. */
const STREAM_COLLECT_TIMEOUT_MS = Number(process.env.VOICE_STREAM_TIMEOUT_MS) || 6000;

/** @type {Map<string, { stop: () => void }>} */
const activePipelines = new Map();

/**
 * Start the receive → STT → LLM → TTS loop for a session. Call when setListening(guildId, true).
 * Stops when setListening(guildId, false) or session ends.
 *
 * @param {object} session - VoiceSession from session manager (connection, audioPlayer, messageHistory, sessionId, textChannelId, guildId)
 * @param {import('discord.js').Client} client
 */
function startPipeline(session, client) {
    const guildId = session.guildId;
    if (activePipelines.has(guildId)) {
        return;
    }

    let processingTurn = false;
    let stopped = false;

    const stop = () => {
        stopped = true;
        activePipelines.delete(guildId);
        try {
            if (session.connection?.receiver?.speaking?.off) {
                session.connection.receiver.speaking.off('start', onStart);
            }
        } catch (_) { /* ignore */ }
        console.log(`${LOG_PREFIX} stopped for guild ${guildId}`);
    };

    activePipelines.set(guildId, { stop });

    const receiver = session.connection?.receiver;
    if (!receiver) {
        console.log(`${LOG_PREFIX} no receiver on connection (guild ${guildId}); listening will not receive audio`);
        return;
    }

    /** @param {string} userId */
    async function onStart(userId) {
        console.log(`${LOG_PREFIX} guild ${guildId} user ${userId} started speaking`);
        if (stopped || !session.listening || processingTurn) {
            console.log(`${LOG_PREFIX} guild ${guildId} skip: stopped=${stopped} listening=${session.listening} processingTurn=${processingTurn}`);
            return;
        }
        processingTurn = true;
        let tempPath = null;
        try {
            const { EndBehaviorType } = require('@discordjs/voice');
            const endBehavior = { end: { behavior: EndBehaviorType.AfterSilence, duration: 500 } };
            const stream = receiver.subscribe(userId, endBehavior);

            const opusChunks = [];
            stream.on('data', (chunk) => {
                if (Buffer.isBuffer(chunk)) opusChunks.push(chunk);
                else if (chunk && typeof chunk === 'object' && Buffer.isBuffer(chunk.data)) opusChunks.push(chunk.data);
                else if (chunk != null) opusChunks.push(Buffer.from(chunk));
            });
            const streamEndPromise = new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });
            let streamTimeoutId;
            const timeoutPromise = new Promise((resolve) => {
                streamTimeoutId = setTimeout(() => {
                    console.log(`${LOG_PREFIX} guild ${guildId} stream collect timeout after ${STREAM_COLLECT_TIMEOUT_MS / 1000}s, using partial audio (${opusChunks.length} opus packets)`);
                    stream.destroy?.();
                    resolve();
                }, STREAM_COLLECT_TIMEOUT_MS);
            });
            await Promise.race([streamEndPromise, timeoutPromise]);
            if (streamTimeoutId) clearTimeout(streamTimeoutId);

            if (opusChunks.length === 0) {
                console.log(`${LOG_PREFIX} guild ${guildId} no opus packets received, skipping turn`);
                processingTurn = false;
                return;
            }

            const { OpusEncoder } = require('@discordjs/opus');
            const opusDecoder = new OpusEncoder(OPUS_SAMPLE_RATE, OPUS_CHANNELS);
            const pcmChunks = [];
            for (const opusPacket of opusChunks) {
                try {
                    const pcm = opusDecoder.decode(opusPacket);
                    if (pcm && pcm.length) pcmChunks.push(pcm);
                } catch (e) {
                    // skip bad/corrupt opus packet
                }
            }
            opusDecoder.delete?.();

            const pcmBuffer = pcmChunks.length ? Buffer.concat(pcmChunks) : Buffer.alloc(0);
            if (pcmBuffer.length < MIN_PCM_BYTES) {
                console.log(`${LOG_PREFIX} guild ${guildId} decoded PCM too short (${pcmBuffer.length} bytes from ${opusChunks.length} packets), skipping turn`);
                processingTurn = false;
                return;
            }

            tempPath = path.join(os.tmpdir(), `parrott-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.pcm`);
            fs.writeFileSync(tempPath, pcmBuffer);

            const convertedPath = path.join(os.tmpdir(), `parrott-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
            const { spawn } = require('child_process');
            const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
            const ffmpegExitCode = await new Promise((resolve, reject) => {
                const ffmpeg = spawn(ffmpegPath, [
                    '-f', 's16le', '-ac', String(OPUS_CHANNELS), '-ar', String(OPUS_SAMPLE_RATE),
                    '-i', tempPath,
                    '-acodec', 'libmp3lame', '-f', 'mp3', convertedPath,
                ], { stdio: 'ignore' });
                ffmpeg.on('close', resolve);
                ffmpeg.on('error', reject);
            });
            try { if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
            tempPath = convertedPath;
            if (ffmpegExitCode !== 0) {
                console.log(`${LOG_PREFIX} guild ${guildId} ffmpeg failed: exit ${ffmpegExitCode} (PCM→mp3), skipping turn`);
                try { if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath); } catch (_) {}
                processingTurn = false;
                return;
            }

            const sttResult = await transcribeFromFile(convertedPath);
            try { if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath); } catch (_) {}
            if (!sttResult.success || !sttResult.text?.trim()) {
                console.log(`${LOG_PREFIX} guild ${guildId} STT failed or empty: success=${sttResult.success} error=${sttResult.error ?? 'none'} textLength=${sttResult.text?.length ?? 0}`);
                processingTurn = false;
                return;
            }

            const userText = sttResult.text.trim();
            console.log(`${LOG_PREFIX} guild ${guildId} STT: "${userText.length > 120 ? userText.slice(0, 120) + '…' : userText}"`);
            appendAndCompress(session, userText);

            let userMessage = userText;
            const expectUserId = session.expectDirectInputFromUserId;

            if (expectUserId) {
                const match = userId === expectUserId;
                console.log(`${LOG_PREFIX} guild ${guildId} expectDirectInputFromUserId=${expectUserId} currentUser=${userId} match=${match} → ${match ? 'using utterance' : 'ignoring'}`);
                if (match) {
                    session.expectDirectInputFromUserId = null;
                    userMessage = userText;
                } else {
                    processingTurn = false;
                    return;
                }
            } else {
                const afterTrigger = extractAfterTrigger(userText);
                const triggerLabel = afterTrigger === null ? 'no match' : (afterTrigger === '' ? 'trigger only' : afterTrigger.slice(0, 80) + (afterTrigger.length > 80 ? '…' : ''));
                console.log(`${LOG_PREFIX} guild ${guildId} trigger check: afterTrigger=${triggerLabel}`);
                if (afterTrigger !== null) {
                    if (afterTrigger.length > 0) {
                        userMessage = afterTrigger;
                    } else {
                        console.log(`${LOG_PREFIX} guild ${guildId} waiting for next utterance from ${userId}`);
                        session.expectDirectInputFromUserId = userId;
                        processingTurn = false;
                        return;
                    }
                }
            }

            console.log(`${LOG_PREFIX} guild ${guildId} running LLM for userMessage: "${userMessage.length > 80 ? userMessage.slice(0, 80) + '…' : userMessage}"`);
            session.messageHistory.push({ role: 'user', content: userMessage });
            await insertVoiceSessionTurn({ session_id: session.sessionId, speaker: 'user', content: userMessage });

            const systemPrompt = parrotConfig.getSystemPromptWithTools({});
            const messages = [
                { role: 'system', content: systemPrompt },
                ...session.messageHistory.map((m) => ({ role: m.role, content: m.content })),
            ];

            let textChannel = null;
            if (session.textChannelId) {
                try {
                    textChannel = await client.channels.fetch(session.textChannelId);
                } catch (_) {}
            }
            const guild = client.guilds.cache.get(session.guildId) ?? await client.guilds.fetch(session.guildId).catch(() => null);
            const fakeMessage = {
                guild,
                channel: textChannel,
                author: { id: userId },
                id: `voice-${session.sessionId}`,
            };
            const context = { message: fakeMessage, client, voiceSession: session };

            const voiceModel = process.env.VOICE_MODEL?.trim() || parrotConfig.voice_model || parrotConfig.model;
            const { text, steps } = await chatWithTools(messages, context, {
                model: voiceModel,
                maxTokens: Math.max(parrotConfig.max_completion_tokens ?? 256, 400),
            });
            const finalText = text?.trim() || 'SQUAWK.';
            const toolsCalled = getToolsCalledFromSteps(steps);

            if (toolsCalled.includes('introspection') && textChannel) {
                try {
                    await textChannel.send({ content: finalText.slice(0, 1900) || '—' });
                } catch (e) {
                    console.error(`${LOG_PREFIX} post introspection to channel:`, e?.message);
                }
            }

            session.messageHistory.push({ role: 'assistant', content: finalText });
            await insertVoiceSessionTurn({ session_id: session.sessionId, speaker: 'bot', content: finalText });

            await playInSession(session, finalText);
        } catch (err) {
            console.error(`${LOG_PREFIX} turn error (guild ${guildId} user ${userId}):`, err?.message || err);
        } finally {
            if (tempPath && fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            processingTurn = false;
        }
    }

    try {
        if (receiver.speaking && typeof receiver.speaking.on === 'function') {
            receiver.speaking.on('start', onStart);
            console.log(`${LOG_PREFIX} guild ${guildId} listening for speech (receiver.speaking.start)`);
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} receiver.speaking.on:`, e?.message);
    }
}

/**
 * Stop the pipeline for a guild. Call when setListening(guildId, false).
 * @param {string} guildId
 */
function stopPipeline(guildId) {
    const entry = activePipelines.get(guildId);
    if (entry?.stop) {
        entry.stop();
    }
}

module.exports = {
    startPipeline,
    stopPipeline,
    PARROTT_TRIGGER_REGEX: require('./keyword-trigger').PARROTT_TRIGGER_REGEX,
};
