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

const LOG_PREFIX = '[Voice pipeline]';

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
        if (stopped || !session.listening || processingTurn) return;
        processingTurn = true;
        let tempPath = null;
        try {
            const { EndBehaviorType } = require('@discordjs/voice');
            const endBehavior = { end: { behavior: EndBehaviorType.AfterSilence, duration: 500 } };
            const stream = receiver.subscribe(userId, endBehavior);

            tempPath = path.join(os.tmpdir(), `parrott-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.opus`);
            const writeStream = fs.createWriteStream(tempPath);
            await new Promise((resolve, reject) => {
                stream.pipe(writeStream);
                stream.on('end', resolve);
                stream.on('error', reject);
                writeStream.on('error', reject);
            });
            writeStream.end();
            await new Promise((r) => writeStream.on('finish', r));

            const convertedPath = path.join(os.tmpdir(), `parrott-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
            const { spawn } = require('child_process');
            const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
            await new Promise((resolve, reject) => {
                const ffmpeg = spawn(ffmpegPath, ['-f', 'opus', '-i', tempPath, '-acodec', 'libmp3lame', '-f', 'mp3', convertedPath], { stdio: 'ignore' });
                ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
                ffmpeg.on('error', reject);
            });
            try { fs.unlinkSync(tempPath); } catch (_) {}
            tempPath = convertedPath;

            const sttResult = await transcribeFromFile(convertedPath);
            try { if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath); } catch (_) {}
            if (!sttResult.success || !sttResult.text?.trim()) {
                processingTurn = false;
                return;
            }

            const userText = sttResult.text.trim();
            session.messageHistory.push({ role: 'user', content: userText });
            await insertVoiceSessionTurn({ session_id: session.sessionId, speaker: 'user', content: userText });

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

            const { text, steps } = await chatWithTools(messages, context, {
                model: parrotConfig.model,
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
            console.error(`${LOG_PREFIX} turn error:`, err?.message || err);
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
};
