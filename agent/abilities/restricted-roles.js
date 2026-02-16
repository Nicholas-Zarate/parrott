/**
 * Blocked Discord role names: users with any of these roles cannot use the parrot and won't receive DMs.
 * Set BLOCKED_DISCORD_ROLE_NAMES (comma-separated, case-insensitive), e.g. "Wanderer,Guest".
 */

const ENV_KEY = 'BLOCKED_DISCORD_ROLE_NAMES';

/** Cached list (lowercased) so we don't re-parse env every call. */
let _blockedLower = null;

/**
 * @returns {string[]} Lowercased blocked role names; empty if env unset.
 */
function getBlockedRoleNames() {
    if (_blockedLower !== null) return _blockedLower;
    const raw = process.env[ENV_KEY]?.trim() || '';
    _blockedLower = raw
        ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];
    return _blockedLower;
}

/**
 * True if the guild member has any role whose name (case-insensitive) is in BLOCKED_DISCORD_ROLE_NAMES.
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @returns {boolean}
 */
function hasBlockedRole(member) {
    if (!member?.roles?.cache) return false;
    const blocked = getBlockedRoleNames();
    if (blocked.length === 0) return false;
    for (const [, role] of member.roles.cache) {
        const name = role?.name?.trim?.()?.toLowerCase?.() ?? '';
        if (name && blocked.includes(name)) return true;
    }
    return false;
}

/** Reset cached list (for tests). */
function resetBlockedRoleNamesCache() {
    _blockedLower = null;
}

module.exports = {
    getBlockedRoleNames,
    hasBlockedRole,
    resetBlockedRoleNamesCache,
};
