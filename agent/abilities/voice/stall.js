/**
 * Play a short "hold on" / stall message in VC before slow work (e.g. joke lookup, song lyrics).
 * Reusable so make_joke_like, sing_song, and other slow tools can give immediate feedback.
 */

const { playInVoiceChannel } = require('./play');

const TEMPLATES = {
    joke: (userName) =>
        userName
            ? `Okay, one second while I come up with a joke for you, ${userName}.`
            : 'Okay, one second while I come up with a joke for you.',
    song: (userName) =>
        userName
            ? `One sec, finding that song for you, ${userName}.`
            : 'One sec, finding that song...',
};

/**
 * Build the stall message from a template or use the string as the full message.
 * @param {string} template - 'joke' | 'song' or a custom full message
 * @param {{ userName?: string }} [options]
 * @returns {string}
 */
function getStallMessage(template, options = {}) {
    const userName = options.userName != null ? String(options.userName).trim() : '';
    const fn = TEMPLATES[template];
    if (typeof fn === 'function') return fn(userName || undefined);
    return typeof template === 'string' && template.trim() ? template.trim() : 'One second...';
}

/**
 * Play a stall message in the given voice channel (join, TTS, leave). Best-effort; use for
 * immediate feedback before slow work. Returns same shape as playInVoiceChannel.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @param {{ template: string, userName?: string }} options - template: 'joke' | 'song' or custom full message
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function playStallInVoice(client, voiceChannel, options = {}) {
    const text = getStallMessage(options.template || 'One second...', {
        userName: options.userName,
    });
    return playInVoiceChannel(client, voiceChannel, { type: 'tts', text });
}

module.exports = {
    playStallInVoice,
    getStallMessage,
};
