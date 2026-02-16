/**
 * Fetch prompt sections from Supabase (parrot_prompt_sections table).
 * Used when PARROT_TONES_SOURCE=supabase. Returns map of slug -> content.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_prompt_sections';

/**
 * Fetch active prompt sections and return { slug: content, ... }.
 * @returns {Promise<{ [slug: string]: string } | null>} null on error or no client
 */
async function getPromptSectionsFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('slug, content')
        .eq('is_active', true)
        .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('[Prompt sections] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const sections = {};
    for (const row of data) {
        const slug = row.slug?.trim();
        if (!slug) continue;
        sections[slug] = String(row.content ?? '');
    }

    return sections;
}

module.exports = {
    getPromptSectionsFromSupabase,
};
