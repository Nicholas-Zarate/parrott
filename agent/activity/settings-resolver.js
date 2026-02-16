/**
 * Resolves activity trigger settings for a (guild, triggerType).
 * Order: DB row (guild then app-default) → file config/activity.js.
 * Return shape is the same whether from DB or file so callers stay simple.
 */

const activityConfig = require('../config/activity');
const { getRow } = require('../supabase/activity-trigger-settings');

/**
 * Build resolved settings from file only (used when no DB row).
 * @param {string} triggerType
 * @returns {object} ResolvedTriggerSettings shape
 */
function fromFile(triggerType) {
    const trigger = activityConfig.triggers[triggerType];
    return {
        enabled: trigger?.enabled ?? true,
        cooldownMinutes: trigger?.cooldownMinutes ?? 90,
        deliverChannel: true,
        deliverDm: activityConfig.dmUser === true,
        deliverVoice: activityConfig.voiceIfConnected === true,
        channelNameOverride: null,
        config: trigger && typeof trigger === 'object' ? { ...trigger } : {},
    };
}

/**
 * Normalize a DB row to the same shape as fromFile (camelCase, consistent types).
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
 * Get resolved settings for (guildId, triggerType). DB overrides file; guild row overrides app-default row.
 * When Supabase is unconfigured or no row exists, returns file-based settings (current behavior).
 * @param {string|null} guildId - Discord guild ID
 * @param {string} triggerType - e.g. 'game_start', 'go_live'
 * @returns {Promise<object>} { enabled, cooldownMinutes, deliverChannel, deliverDm, deliverVoice, channelNameOverride, config }
 */
async function getResolvedSettings(guildId, triggerType) {
    const row = await getRow(guildId, triggerType);
    if (row) return fromRow(row);
    return fromFile(triggerType);
}

module.exports = {
    getResolvedSettings,
    fromFile,
    fromRow,
};
