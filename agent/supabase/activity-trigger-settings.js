/**
 * Supabase read helper for activity_trigger_settings.
 * Resolution order: guild row → app-default row (guild_id IS NULL). No write API here (Phase 1).
 */

const { getClient } = require('./client');

const TABLE = 'activity_trigger_settings';

/**
 * Fetch one settings row: guild-specific first, then app-default.
 * @param {string|null} guildId - Discord guild ID (null = only app defaults).
 * @param {string} triggerType - e.g. 'game_start', 'go_live'.
 * @returns {Promise<object|null>} Row or null. Columns: deliver_channel, deliver_dm, deliver_voice, enabled, cooldown_minutes, channel_name_override, config, etc.
 */
async function getRow(guildId, triggerType) {
    const supabase = getClient();
    if (!supabase) return null;

    if (guildId != null && guildId !== '') {
        const { data: guildRow } = await supabase
            .from(TABLE)
            .select('*')
            .eq('guild_id', String(guildId))
            .eq('trigger_type', String(triggerType))
            .maybeSingle();
        if (guildRow) return guildRow;
    }

    const { data: defaultRow } = await supabase
        .from(TABLE)
        .select('*')
        .is('guild_id', null)
        .eq('trigger_type', String(triggerType))
        .maybeSingle();

    return defaultRow ?? null;
}

module.exports = { getRow };
