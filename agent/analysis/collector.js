const { ANALYSIS } = require('../config/constants');

const DEFAULT_MAX = ANALYSIS.DEFAULT_MAX_MESSAGES_PER_CHANNEL;
const FETCH_BATCH = 100;

/**
 * Fetch messages from a channel within a time range (by timestamp) and cap.
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} options
 * @param {number} options.after - Timestamp (ms) - only messages after this
 * @param {number} [options.maxMessages=DEFAULT_MAX] - Max messages to fetch per channel
 * @returns {Promise<import('discord.js').Message[]>}
 */
async function fetchMessagesInRange(channel, { after, maxMessages = DEFAULT_MAX }) {
    const messages = [];
    let lastId;

    while (messages.length < maxMessages) {
        const options = { limit: Math.min(FETCH_BATCH, maxMessages - messages.length) };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
            if (msg.createdTimestamp < after) return messages;
            messages.push(msg);
            if (messages.length >= maxMessages) return messages;
        }

        const last = fetched.last();
        lastId = last.id;
        if (last.createdTimestamp < after) break;
        if (fetched.size < FETCH_BATCH) break;
    }

    return messages;
}

/**
 * Collect raw message and presence data for a guild (or single channel).
 * @param {import('discord.js').Guild} guild
 * @param {Object} options
 * @param {number} options.days
 * @param {number} [options.maxMessagesPerChannel]
 * @param {'channel'|'server'} options.scope - channel = current channel only (pass channelId), server = all text channels
 * @param {string} [options.channelId] - Required when scope is 'channel'
 * @returns {Promise<{ channelMessages: Map<string, import('discord.js').Message[]>, userActivities: Map<string, Array<{name: string, type: number, state?: string}>>, after: number }>}
 */
async function collectGuildData(guild, options) {
    const days = Math.max(ANALYSIS.MIN_DAYS, Math.min(ANALYSIS.MAX_DAYS, options.days || ANALYSIS.DEFAULT_DAYS));
    const after = Date.now() - days * 24 * 60 * 60 * 1000;
    const maxPerChannel = options.maxMessagesPerChannel ?? DEFAULT_MAX;
    const scope = options.scope || 'channel';
    const channelId = options.channelId;

    const channelMessages = new Map();

    if (scope === 'channel' && channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
            const messages = await fetchMessagesInRange(channel, { after, maxMessages: maxPerChannel });
            channelMessages.set(channel.id, messages);
        }
    } else {
        const channels = guild.channels.cache.filter(c => c.isTextBased());
        for (const [, channel] of channels) {
            try {
                const messages = await fetchMessagesInRange(channel, { after, maxMessages: maxPerChannel });
                if (messages.length > 0) {
                    channelMessages.set(channel.id, messages);
                }
            } catch (_) {
                /* skip channel (no permission or unavailable) */
            }
        }
    }

    const userActivities = new Map();
    if (guild.members.cache) {
        for (const [, member] of guild.members.cache) {
            const presence = member.presence;
            if (presence?.activities?.length) {
                const activities = presence.activities.map(a => ({
                    name: a.name,
                    type: a.type,
                    state: a.state || undefined
                }));
                userActivities.set(member.id, activities);
            }
        }
    }

    return { channelMessages, userActivities, after };
}

module.exports = { fetchMessagesInRange, collectGuildData };
