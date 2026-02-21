/**
 * Voice session and turns persistence. Used by the voice session manager.
 */

const { getClient } = require('./client');

const TABLE_SESSIONS = 'voice_sessions';
const TABLE_TURNS = 'voice_session_turns';

/**
 * Insert a voice session and return the created row (with id).
 * @param {{ guild_id: string, channel_id: string, text_channel_id?: string | null }} row
 * @returns {Promise<{ id: string } | { error: string }>}
 */
async function insertVoiceSession(row) {
    const supabase = getClient();
    if (!supabase) {
        return { error: 'Supabase not configured.' };
    }
    const record = {
        guild_id: String(row.guild_id),
        channel_id: String(row.channel_id),
        text_channel_id: row.text_channel_id != null ? String(row.text_channel_id) : null,
    };
    const { data, error } = await supabase.from(TABLE_SESSIONS).insert(record).select('id').single();
    if (error) {
        console.error('[DB] voice_sessions insert error:', error.message);
        return { error: error.message };
    }
    return { id: data.id };
}

/**
 * Set ended_at for a voice session.
 * @param {string} sessionId - UUID of the session
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function endVoiceSession(sessionId) {
    const supabase = getClient();
    if (!supabase) {
        return { ok: false, error: 'Supabase not configured.' };
    }
    const { error } = await supabase
        .from(TABLE_SESSIONS)
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    if (error) {
        console.error('[DB] voice_sessions update ended_at error:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/**
 * Insert one voice session turn (user or bot).
 * @param {{ session_id: string, speaker: 'user' | 'bot', content: string }} row
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function insertVoiceSessionTurn(row) {
    const supabase = getClient();
    if (!supabase) {
        return { ok: false, error: 'Supabase not configured.' };
    }
    const record = {
        session_id: String(row.session_id),
        speaker: row.speaker === 'bot' ? 'bot' : 'user',
        content: String(row.content),
    };
    const { error } = await supabase.from(TABLE_TURNS).insert(record);
    if (error) {
        console.error('[DB] voice_session_turns insert error:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

module.exports = {
    insertVoiceSession,
    endVoiceSession,
    insertVoiceSessionTurn,
};
