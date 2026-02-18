/**
 * Fetch tool descriptions from Supabase (parrot_tool_descriptions table).
 * Returns metadata (description, example_command, enabled) for all tools.
 * Used for model tool descriptions and introspection 'tools' subtool list (introspection shows enabled/disabled).
 */

const { getClient } = require('./client');

const TABLE = 'parrot_tool_descriptions';

/**
 * Fetch all tool metadata: description, example_command, and enabled (is_active) per tool_slug.
 * @returns {Promise<{ [toolSlug: string]: { description: string, example_command: string, enabled: boolean } } | null>} null on error or no client
 */
async function getToolDescriptionsFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('tool_slug, description, example_command, is_active');

    if (error) {
        console.error('[Tool descriptions] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const map = {};
    for (const row of data) {
        const slug = row.tool_slug?.trim();
        if (!slug) continue;
        map[slug] = {
            description: String(row.description ?? ''),
            example_command: row.example_command != null ? String(row.example_command).trim() : '',
            enabled: row.is_active === true,
        };
    }

    return map;
}

module.exports = {
    getToolDescriptionsFromSupabase,
};
