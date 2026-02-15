/**
 * Channels where the bot responds to @mentions.
 * - If MENTION_CHANNEL_IDS is set (comma-separated Discord channel IDs), only those channels are allowed (tier defaults to 'semi').
 * - Otherwise, only channels whose name is a key in MENTION_CHANNEL_TIERS are allowed; tier is per channel.
 *
 * Tier enum: rate limit applied per channel tier.
 * - unlimited: no limit
 * - semi: 5 max in 2 minutes
 * - limited: 1 max in 5 minutes
 */
const TIER_UNLIMITED = 'unlimited';
const TIER_SEMI = 'semi';
const TIER_LIMITED = 'limited';

/** Channel name (lowercase key) -> tier. Defines both allowlist and rate-limit tier. */
const MENTION_CHANNEL_TIERS = {
    general: TIER_UNLIMITED,
    testing: TIER_UNLIMITED,
    parrott: TIER_SEMI,
    finals: TIER_SEMI,
};

/** Allowed channel names (for allowlist when not using MENTION_CHANNEL_IDS). */
const DEFAULT_MENTION_CHANNEL_NAMES = Object.keys(MENTION_CHANNEL_TIERS);

const envIds = process.env.MENTION_CHANNEL_IDS;
const allowedChannelIds = envIds ? envIds.split(',').map((id) => id.trim()).filter(Boolean) : null;

/** Default tier when channel is allowed by ID only (no name in MENTION_CHANNEL_TIERS). */
const DEFAULT_TIER = TIER_SEMI;

/**
 * Resolve the channel to check: use parent for threads. If parent is a category (type 4), we also check the thread's own name so threads named "general" under a category still match #general.
 */
function getChannelForAllowlist(channel) {
    return channel?.parent ?? channel;
}

function nameMatchesAllowlist(name) {
    if (!name) return false;
    const nameLower = String(name).toLowerCase();
    return Object.keys(MENTION_CHANNEL_TIERS).some((n) => n.toLowerCase() === nameLower);
}

/**
 * Get the rate-limit tier for an allowed channel. Call only after isChannelAllowed(channel) is true.
 * @param {import('discord.js').Channel} channel
 * @returns {'unlimited'|'semi'|'limited'}
 */
function getChannelTier(channel) {
    const ch = getChannelForAllowlist(channel);
    if (!ch) return DEFAULT_TIER;
    if (allowedChannelIds && allowedChannelIds.length > 0) {
        if (allowedChannelIds.includes(ch.id) || (channel?.id && allowedChannelIds.includes(channel.id))) {
            return DEFAULT_TIER;
        }
    }
    const nameToUse = channel?.parent && ch.type === 4 ? channel.name : ch.name;
    const nameLower = nameToUse ? String(nameToUse).toLowerCase() : '';
    const entry = Object.entries(MENTION_CHANNEL_TIERS).find(([k]) => k.toLowerCase() === nameLower);
    return entry ? entry[1] : DEFAULT_TIER;
}

function isChannelAllowed(channel) {
    const ch = getChannelForAllowlist(channel);
    if (!ch) return false;
    if (allowedChannelIds && allowedChannelIds.length > 0) {
        if (allowedChannelIds.includes(ch.id)) return true;
        if (channel?.id && allowedChannelIds.includes(channel.id)) return true;
        return false;
    }
    if (nameMatchesAllowlist(ch.name)) return true;
    // When in a thread, parent can be the category (type 4) not the text channel; allow if the thread's name matches (e.g. thread "general" under category "Text Channels")
    if (channel?.parent && ch.type === 4 && nameMatchesAllowlist(channel.name)) return true;
    if (channel && !nameMatchesAllowlist(channel.name)) {
        console.log(`[Debug] Channel allowlist check: channel.name="${ch.name}" (type: ${ch.type}) | allowlist: [${DEFAULT_MENTION_CHANNEL_NAMES.join(', ')}] | allowed: false`);
    }
    return false;
}

module.exports = {
    DEFAULT_MENTION_CHANNEL_NAMES,
    MENTION_CHANNEL_TIERS,
    TIER_UNLIMITED,
    TIER_SEMI,
    TIER_LIMITED,
    isChannelAllowed,
    getChannelTier,
};
