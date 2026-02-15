/**
 * Play audio in a Discord voice channel. Used by the squawk tool.
 * Primary path is TTS (ElevenLabs); optional type: 'file' for local audio files.
 *
 * Requires: @discordjs/voice, ffmpeg (system or ffmpeg-static). Bot needs
 * Connect + Speak in the voice channel.
 */

const path = require('path');
const fs = require('fs');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    getVoiceConnection,
} = require('@discordjs/voice');
const { generateAudio } = require('./tts');

const LOG_PREFIX = '[Voice]';

/**
 * Play a sound in the given voice channel and leave when done.
 * - type: 'tts', text: string → use TTS (ElevenLabs); no file required.
 * - type: 'file', path: string → play local file (optional fallback).
 *
 * @param {import('discord.js').Client} client - Bot client (for adapter)
 * @param {import('discord.js').VoiceChannel} voiceChannel - Channel to join
 * @param {{ type: 'file', path: string } | { type: 'tts', text: string }} options - What to play
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function playInVoiceChannel(client, voiceChannel, options) {
    const channelLabel = voiceChannel?.name ? `#${voiceChannel.name}` : voiceChannel?.id ?? '?';
    if (!voiceChannel?.id || !voiceChannel?.guild) {
        console.log(`${LOG_PREFIX} playInVoiceChannel skipped: invalid voice channel`);
        return { success: false, error: 'Invalid voice channel.' };
    }

    const guild = voiceChannel.guild;
    console.log(`${LOG_PREFIX} playInVoiceChannel ${channelLabel} type=${options.type}`);
    const adapterCreator = guild.voiceAdapterCreator;
    if (!adapterCreator) {
        return { success: false, error: 'Voice adapter not available (wrong Discord.js version?).' };
    }

    let absolutePath;

    if (options.type === 'tts') {
        const ttsResult = await generateAudio(options.text || '');
        if (!ttsResult.success) {
            console.log(`${LOG_PREFIX} TTS failed: ${ttsResult.error}`);
            return { success: false, error: ttsResult.error };
        }
        absolutePath = ttsResult.path;
    } else if (options.type === 'file' && options.path) {
        absolutePath = path.isAbsolute(options.path) ? options.path : path.resolve(__dirname, options.path);
        if (!fs.existsSync(absolutePath)) {
            console.log(`${LOG_PREFIX} File not found: ${absolutePath}`);
            return { success: false, error: 'Audio file not found.' };
        }
    } else {
        return { success: false, error: 'Options must be { type: "tts", text: "..." } or { type: "file", path: "..." }.' };
    }

    const isTtsTempFile = options.type === 'tts';

    function deleteTtsTempFileIfNeeded() {
        if (isTtsTempFile && absolutePath && fs.existsSync(absolutePath)) {
            try {
                fs.unlinkSync(absolutePath);
            } catch (_) { /* ignore */ }
        }
    }

    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator,
            selfDeaf: false,
        });
    } catch (err) {
        console.error(`${LOG_PREFIX} joinVoiceChannel error:`, err?.message || err);
        deleteTtsTempFileIfNeeded();
        return { success: false, error: err?.message || 'Failed to join voice channel.' };
    }
    console.log(`${LOG_PREFIX} joined ${channelLabel}, starting playback`);

    const player = createAudioPlayer();

    try {
        const resource = createAudioResource(absolutePath, { inlineVolume: false });
        player.play(resource);
        connection.subscribe(player);
    } catch (err) {
        console.error(`${LOG_PREFIX} createAudioResource/play error:`, err?.message || err);
        connection.destroy();
        deleteTtsTempFileIfNeeded();
        return { success: false, error: err?.message || 'Failed to play audio. Is FFmpeg installed?' };
    }

    return new Promise((resolve) => {
        let settled = false;
        const once = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const timeoutMs = 30000;
        const timeoutId = setTimeout(() => {
            console.log(`${LOG_PREFIX} playback timed out after ${timeoutMs / 1000}s`);
            once({ success: false, error: 'Playback timed out.' });
        }, timeoutMs);

        function cleanup() {
            clearTimeout(timeoutId);
            player.removeAllListeners();
            try {
                const conn = getVoiceConnection(guild.id);
                if (conn) conn.destroy();
            } catch (_) { /* ignore */ }
            deleteTtsTempFileIfNeeded();
        }

        player.on(AudioPlayerStatus.Idle, () => {
            console.log(`${LOG_PREFIX} playback finished, leaving ${channelLabel}`);
            once({ success: true });
        });
        player.on('error', (err) => {
            console.error(`${LOG_PREFIX} player error:`, err?.message || err);
            once({ success: false, error: err?.message || 'Playback error.' });
        });
    });
}

/** Fixed phrase for squawk tool until we allow custom lines (e.g. from LLM). */
const SQUAWK_PHRASE = 'whatup ninjas, okay bye, SQUAAK';

/**
 * Join the user's voice channel and speak the squawk phrase via ElevenLabs TTS, then leave.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function playSquawkInChannel(client, voiceChannel) {
    return playInVoiceChannel(client, voiceChannel, { type: 'tts', text: SQUAWK_PHRASE });
}

module.exports = {
    playInVoiceChannel,
    playSquawkInChannel,
};
