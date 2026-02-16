/**
 * Save and read parrot @mention conversation history from Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in env.
 * Logs every insert so you can confirm when data is written.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_conversation_history';

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

/**
 * Fetch conversation history rows for a given time period.
 * Used by the announcement job to build context for the LLM.
 *
 * @param {string|Date} periodStart - ISO timestamp or Date (inclusive)
 * @param {string|Date} periodEnd   - ISO timestamp or Date (exclusive)
 * @param {{ limit?: number }} [options] - max rows (default 100)
 * @returns {Promise<{ data: Array|null; error: string|null; count: number }>}
 */
async function getConversationsForPeriod(periodStart, periodEnd, options = {}) {
    const supabase = getClient();
    if (!supabase) {
        return { data: null, error: 'Supabase not configured.', count: 0 };
    }
    const limit = options.limit ?? 100;
    const start = periodStart instanceof Date ? periodStart.toISOString() : periodStart;
    const end = periodEnd instanceof Date ? periodEnd.toISOString() : periodEnd;

    const { data, error, count } = await supabase
        .from(TABLE)
        .select('id, created_at, channel_id, guild_id, user_text, response_text, tools_called', { count: 'exact' })
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        return { data: null, error: error.message, count: 0 };
    }
    return { data: data ?? [], error: null, count: count ?? (data?.length ?? 0) };
}

module.exports = {
    saveConversation,
    getToolsCalledFromSteps,
    getConversationsForPeriod,
};
