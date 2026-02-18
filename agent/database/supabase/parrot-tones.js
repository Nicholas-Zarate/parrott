/**
 * Fetch personality tones from Supabase (parrot_tones table).
 * Used when PARROT_TONES_SOURCE=supabase. Returns same shape as config/parrot.js tones.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
 */

const { getClient } = require('./client');

const TABLE = 'parrot_tones';

/**
 * Fetch active tones from Supabase and return { text: { task, constraints, maxWords }, vc: { ... }, ... } keyed by slug.
 * @returns {Promise<{ [slug: string]: { task: string, constraints: string, maxWords?: number } } | null>} null on error or no client
 */
async function getParrotTonesFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('slug, task, constraints, max_words')
        .eq('is_active', true)
        .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('[Parrot tones] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const tones = {};
    for (const row of data) {
        const slug = row.slug?.trim();
        if (!slug) continue;
        tones[slug] = {
            task: String(row.task ?? ''),
            constraints: String(row.constraints ?? ''),
            maxWords: row.max_words != null ? Number(row.max_words) : undefined,
        };
    }

    return tones;
}

module.exports = {
    getParrotTonesFromSupabase,
};
