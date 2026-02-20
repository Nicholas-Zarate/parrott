/**
 * Voice session manager: one session per guild. Join VC and stay; start/stop listening (STT).
 * Sessions and turns are persisted to voice_sessions / voice_session_turns.
 */

const { joinVoiceChannel, createAudioPlayer, getVoiceConnection } = require('@discordjs/voice');
const { insertVoiceSession, endVoiceSession } = require('../../database/supabase/voice-sessions');
const { stopPipeline } = require('./pipeline');

const LOG_PREFIX = '[Voice session]';

/**
 * @typedef {Object} VoiceSession
 * @property {string} guildId
 * @property {string} channelId
 * @property {string} [textChannelId]
 * @property {object} connection - VoiceConnection from @discordjs/voice
 * @property {object} audioPlayer - AudioPlayer from @discordjs/voice
 * @property {boolean} listening
 * @property {number} startedAt
 * @property {string} sessionId
 * @property {{ role: string, content: string }[]} messageHistory
 */

/** @type {Map<string, VoiceSession>} */
const sessionsByGuild = new Map();

/**
 * Get the current voice session for a guild, if any.
 * @param {string} guildId
 * @returns {VoiceSession | null}
 */
function getSession(guildId) {
    if (!guildId) return null;
    return sessionsByGuild.get(String(guildId)) ?? null;
}

/**
 * Start a voice session: join VC, create player and receiver, persist session, optionally start listening.
 * @param {import('discord.js').Client} client - Unused; adapter comes from guild
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @param {{ textChannelId?: string | null, startListening?: boolean }} [options]
 * @returns {Promise<{ success: boolean, error?: string, session?: VoiceSession }>}
 */
async function startSession(client, guild, voiceChannel, options = {}) {
    const guildId = guild?.id;
    if (!guildId || !voiceChannel?.id) {
        return { success: false, error: 'Invalid guild or voice channel.' };
    }
    if (sessionsByGuild.has(guildId)) {
        const existing = sessionsByGuild.get(guildId);
        return { success: true, session: existing };
    }

    const adapterCreator = guild.voiceAdapterCreator;
    if (!adapterCreator) {
        return { success: false, error: 'Voice adapter not available.' };
    }

    const { id: sessionId, error: insertError } = await insertVoiceSession({
        guild_id: guildId,
        channel_id: voiceChannel.id,
        text_channel_id: options.textChannelId ?? null,
    });
    if (insertError) {
        return { success: false, error: insertError };
    }

    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator,
            selfDeaf: false, // must be false to receive audio
        });
    } catch (err) {
        console.error(`${LOG_PREFIX} joinVoiceChannel error:`, err?.message || err);
        return { success: false, error: err?.message || 'Failed to join voice channel.' };
    }

    const audioPlayer = createAudioPlayer();
    connection.subscribe(audioPlayer);

    const session = {
        guildId,
        channelId: voiceChannel.id,
        textChannelId: options.textChannelId ?? null,
        connection,
        audioPlayer,
        listening: options.startListening === true,
        startedAt: Date.now(),
        sessionId,
        messageHistory: [],
    };
    sessionsByGuild.set(guildId, session);

    connection.on('stateChange', (oldState, newState) => {
        if (newState.status === 'disconnected' || newState.status === 'destroyed') {
            console.log(`${LOG_PREFIX} connection state ${newState.status} for guild ${guildId}, ending session`);
            endSession(guildId).catch((e) => console.error(`${LOG_PREFIX} endSession on disconnect:`, e?.message || e));
        }
    });

    console.log(`${LOG_PREFIX} started session ${sessionId} in guild ${guildId} #${voiceChannel.name}`);
    return { success: true, session };
}

/**
 * End the voice session for a guild: set ended_at, destroy connection, remove from map.
 * @param {string} guildId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function endSession(guildId) {
    const session = sessionsByGuild.get(String(guildId));
    if (!session) {
        return { ok: true };
    }
    sessionsByGuild.delete(String(guildId));
    stopPipeline(guildId);
    const { ok, error } = await endVoiceSession(session.sessionId);
    try {
        const conn = getVoiceConnection(guildId);
        if (conn) conn.destroy();
    } catch (_) {
        /* ignore */
    }
    console.log(`${LOG_PREFIX} ended session ${session.sessionId} for guild ${guildId}`);
    return { ok, error };
}

/**
 * Set listening on or off for the session. Does not start/stop the receive→STT→LLM→TTS loop here;
 * that is done by the pipeline when listening becomes true (and stopped when false).
 * @param {string} guildId
 * @param {boolean} value
 * @returns {{ success: boolean, error?: string }}
 */
function setListening(guildId, value) {
    const session = sessionsByGuild.get(String(guildId));
    if (!session) {
        return { success: false, error: 'No voice session for this guild.' };
    }
    session.listening = value === true;
    return { success: true };
}

module.exports = {
    getSession,
    startSession,
    endSession,
    setListening,
    sessionsByGuild,
};
