/**
 * Supabase helpers for the activity_listeners table.
 * Logs every activity-triggered message Parrott sends.
 */

const { getClient } = require('./client');

const TABLE = 'activity_listeners';

/**
 * Insert an activity listener event.
 * @param {{
 *   guild_id: string;
 *   user_id: string;
 *   trigger_type: string;
 *   activity_name?: string | null;
 *   activity_type?: number | null;
 *   context?: object;
 *   message?: string | null;
 *   delivered_to?: string[];
 * }} row
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function logActivityEvent(row) {
    const supabase = getClient();
    if (!supabase) {
        console.log('[ActivityDB] Skipping log: Supabase not configured.');
        return { ok: false, error: 'Supabase not configured.' };
    }

    const record = {
        guild_id: String(row.guild_id),
        user_id: String(row.user_id),
        trigger_type: String(row.trigger_type),
        activity_name: row.activity_name != null ? String(row.activity_name) : null,
        activity_type: row.activity_type != null ? Number(row.activity_type) : null,
        context: row.context && typeof row.context === 'object' ? row.context : {},
        message: row.message != null ? String(row.message) : null,
        delivered_to: Array.isArray(row.delivered_to) ? row.delivered_to : [],
    };

    console.log('[ActivityDB] Logging event:', {
        trigger_type: record.trigger_type,
        user_id: record.user_id,
        activity_name: record.activity_name,
    });

    const { error } = await supabase.from(TABLE).insert(record);

    if (error) {
        console.error('[ActivityDB] Insert error:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/**
 * Fetch recent activity events for a user (useful for debugging or dashboards).
 * @param {string} userId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ data: Array|null; error: string|null }>}
 */
async function getRecentEventsForUser(userId, options = {}) {
    const supabase = getClient();
    if (!supabase) return { data: null, error: 'Supabase not configured.' };

    const limit = options.limit ?? 20;
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', String(userId))
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
}

module.exports = {
    logActivityEvent,
    getRecentEventsForUser,
};
