/**
 * Save parrot @mention conversation history to Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in env.
 * Logs every insert so you can confirm when data is written.
 */

const { createClient } = require('@supabase/supabase-js');

const TABLE = 'parrot_conversation_history';

function getClient() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Extract unique tool names from AI SDK generateText result.steps.
 * @param {Array<{ toolCalls?: Array<{ toolName?: string }> }>} [steps]
 * @returns {string[]}
 */
function getToolsCalledFromSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return [];
    const names = new Set();
    for (const step of steps) {
        const calls = step.toolCalls;
        if (Array.isArray(calls)) {
            for (const call of calls) {
                if (call && typeof call.toolName === 'string') names.add(call.toolName);
            }
        }
    }
    return [...names];
}

/**
 * Save one conversation turn to Supabase.
 * @param {{
 *   previous_message_id: string;
 *   reply_message_id?: string;
 *   channel_id: string;
 *   guild_id?: string | null;
 *   user_text: string;
 *   response_text: string;
 *   tools_called?: string[];
 * }} row
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function saveConversation(row) {
    const supabase = getClient();
    if (!supabase) {
        console.log('[DB] Skipping save: Supabase not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).');
        return { ok: false, error: 'Supabase not configured (SUPABASE_URL and key required).' };
    }

    const record = {
        previous_message_id: String(row.previous_message_id),
        reply_message_id: row.reply_message_id != null ? String(row.reply_message_id) : null,
        channel_id: String(row.channel_id),
        guild_id: row.guild_id != null ? String(row.guild_id) : null,
        user_text: String(row.user_text),
        response_text: String(row.response_text),
        tools_called: Array.isArray(row.tools_called) ? row.tools_called : [],
    };

    console.log('[DB] Saving conversation to Supabase:', {
        table: TABLE,
        previous_message_id: record.previous_message_id,
        channel_id: record.channel_id,
        tools_called: record.tools_called,
    });

    const { error } = await supabase.from(TABLE).insert(record);

    if (error) {
        console.error('[DB] Supabase insert error:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

module.exports = {
    saveConversation,
    getToolsCalledFromSteps,
};
