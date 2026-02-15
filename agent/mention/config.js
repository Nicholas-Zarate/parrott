/**
 * Channels where the bot responds to @mentions.
 * - If MENTION_CHANNEL_IDS is set (comma-separated Discord channel IDs), only those channels are allowed.
 * - Otherwise, only channels whose name is in DEFAULT_MENTION_CHANNEL_NAMES (e.g. #parrott, #testing) are allowed.
 */
const DEFAULT_MENTION_CHANNEL_NAMES = ['parrott', 'testing', 'general'];

const envIds = process.env.MENTION_CHANNEL_IDS;
const allowedChannelIds = envIds ? envIds.split(',').map((id) => id.trim()).filter(Boolean) : null;

/**
 * Resolve the channel to check: use parent for threads. If parent is a category (type 4), we also check the thread's own name so threads named "general" under a category still match #general.
 */
function getChannelForAllowlist(channel) {
    return channel?.parent ?? channel;
}

function nameMatchesAllowlist(name) {
    if (!name) return false;
    const nameLower = String(name).toLowerCase();
    return DEFAULT_MENTION_CHANNEL_NAMES.some((n) => n.toLowerCase() === nameLower);
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
    isChannelAllowed
};
