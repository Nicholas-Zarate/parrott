/**
 * Resolves activity trigger settings for a (guild, triggerType).
 * Source: Supabase only. Guild row overrides app-default row (guild_id IS NULL).
 * When no row exists, returns null; callers must skip the trigger or handle accordingly.
 */

const { getRow } = require('../supabase/activity-trigger-settings');

/**
 * Normalize a DB row to ResolvedTriggerSettings shape (camelCase, consistent types).
 * @param {object} row - Raw DB row
 * @returns {object} ResolvedTriggerSettings shape
 */
function fromRow(row) {
    return {
        enabled: row.enabled === true,
        cooldownMinutes: typeof row.cooldown_minutes === 'number' ? row.cooldown_minutes : 90,
        deliverChannel: row.deliver_channel !== false,
        deliverDm: row.deliver_dm === true,
        deliverVoice: row.deliver_voice === true,
        channelNameOverride: row.channel_name_override != null ? String(row.channel_name_override) : null,
        config: row.config && typeof row.config === 'object' ? row.config : {},
    };
}

/**
 * Get resolved settings for (guildId, triggerType). DB only: guild row then app-default row.
 * When Supabase is unconfigured or no row exists, returns null.
 * @param {string|null} guildId - Discord guild ID
 * @param {string} triggerType - e.g. 'game_start', 'go_live'
 * @returns {Promise<object|null>} { enabled, cooldownMinutes, deliverChannel, ... } or null
 */
async function getResolvedSettings(guildId, triggerType) {
    const row = await getRow(guildId, triggerType);
    if (row) return fromRow(row);
    return null;
}

module.exports = {
    getResolvedSettings,
    fromRow,
};
