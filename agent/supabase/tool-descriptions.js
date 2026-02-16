/**
 * Fetch tool descriptions from Supabase (parrot_tool_descriptions table).
 * Used when PARROT_TONES_SOURCE=supabase. Returns map of tool_slug -> description.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_tool_descriptions';

/**
 * Fetch active tool descriptions and return { tool_slug: description, ... }.
 * @returns {Promise<{ [toolSlug: string]: string } | null>} null on error or no client
 */
async function getToolDescriptionsFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('tool_slug, description')
        .eq('is_active', true);

    if (error) {
        console.error('[Tool descriptions] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const map = {};
    for (const row of data) {
        const slug = row.tool_slug?.trim();
        if (!slug) continue;
        map[slug] = String(row.description ?? '');
    }

    return map;
}

module.exports = {
    getToolDescriptionsFromSupabase,
};
