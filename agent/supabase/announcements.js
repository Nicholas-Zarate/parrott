/**
 * Read and write parrot announcements to Supabase (parrot_announcements table).
 * Used by agent/jobs/announcement-job.js for the 6-hour rundown.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_announcements';

/**
 * Insert one announcement row.
 * @param {{
 *   period_start: string|Date;
 *   period_end: string|Date;
 *   rundown_text: string;
 *   metadata?: object;
 * }} row
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function insertAnnouncement(row) {
    const supabase = getClient();
    if (!supabase) {
        console.log('[Announcements] Skipping insert: Supabase not configured.');
        return { ok: false, error: 'Supabase not configured.' };
    }

    const record = {
        period_start: row.period_start instanceof Date ? row.period_start.toISOString() : row.period_start,
        period_end: row.period_end instanceof Date ? row.period_end.toISOString() : row.period_end,
        rundown_text: String(row.rundown_text),
        metadata: row.metadata ?? null,
    };

    console.log('[Announcements] Inserting:', {
        period_start: record.period_start,
        period_end: record.period_end,
        text_length: record.rundown_text.length,
    });

    const { error } = await supabase.from(TABLE).insert(record);

    if (error) {
        console.error('[Announcements] Supabase insert error:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

module.exports = { insertAnnouncement };
