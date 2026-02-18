/**
 * Read user DM preference by Discord ID. Used by the agent before sending activity or timer DMs.
 * No row or allow_activity_dm = true → allow DMs; allow_activity_dm = false → do not send.
 */

const { getClient } = require('./client');

const TABLE = 'user_dm_preferences';

/**
 * @param {string} discordId - Discord user ID (snowflake)
 * @returns {Promise<boolean>} True if we may send activity/timer DMs; false to skip.
 */
async function getAllowActivityDm(discordId) {
    if (!discordId || String(discordId).trim() === '') return true;
    const supabase = getClient();
    if (!supabase) return true;

    const { data, error } = await supabase
        .from(TABLE)
        .select('allow_activity_dm')
        .eq('discord_id', String(discordId))
        .maybeSingle();

    if (error) {
        console.warn(`[user-dm-preferences] getAllowActivityDm(${discordId}) error:`, error.message);
        return true;
    }
    if (!data) return true;
    return data.allow_activity_dm === true;
}

module.exports = {
    getAllowActivityDm,
};
