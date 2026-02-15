const roastConfig = require('../../config/roast');
const { collectGuildData } = require('../../analysis/collector');

const ACTIVITY_TYPE_LABELS = ['Playing', 'Streaming', 'Listening to', 'Watching', 'Custom', 'Competing in'];

/** Custom emoji <:name:123> and common unicode emoji (simplified). */
const EMOJI_REGEX = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

/**
 * Count top emojis from message contents.
 * @param {Array<{ content: string }>} messages
 * @param {number} topN
 * @returns {string[]}
 */
function topEmojisFromMessages(messages, topN = roastConfig.MAX_EMOJI_TOP) {
    const counts = new Map();
    for (const m of messages) {
        const matches = (m.content || '').match(EMOJI_REGEX) || [];
        for (const em of matches) {
            counts.set(em, (counts.get(em) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([emoji]) => emoji);
}

/**
 * Count URLs in message contents.
 * @param {Array<{ content: string }>} messages
 * @returns {number}
 */
function countLinks(messages) {
    let n = 0;
    for (const m of messages) {
        const matches = (m.content || '').match(URL_REGEX);
        if (matches) n += matches.length;
    }
    return n;
}

/**
 * Collect messages and activity for a single user (for roast/LLM).
 * Includes profile, roles, presence, per-message context, and aggregated stats.
 * @param {import('discord.js').Guild} guild
 * @param {Object} options
 * @param {string} options.targetUserId
 * @param {number} options.days
 * @param {'channel'|'server'} options.scope
 * @param {string} [options.channelId]
 * @param {number} [options.maxMessagesPerChannel]
 * @param {import('discord.js').User} [options.targetUser] - Optional User from interaction (used for profile when member not in server)
 * @returns {Promise<{
 *   messages: Array<{ channelName: string, content: string, createdAt: Date, isReply?: boolean, attachmentCount?: number, stickerNames?: string[], reactions?: Array<{ emoji: string, count: number }> }>,
 *   activities: Array<{ name: string, type: number, typeLabel: string, state?: string }>,
 *   profile: { globalName?: string|null, nickname?: string|null, displayName: string, accountCreatedAt?: Date|null, joinedAt?: Date|null, bot: boolean, guildName: string },
 *   roleNames: string[],
 *   presence: { status?: string, clients?: string[] },
 *   stats: { messageCount: number, avgLength: number, topEmojis: string[], linkCount: number, replyCount: number, replyRatio: number, channelNames: string[] }
 * }>}
 */
async function collectUserDataForRoast(guild, options) {
    const { targetUserId, days, scope, channelId, maxMessagesPerChannel, targetUser: optionUser } = options;
    const maxRoleNames = roastConfig.MAX_ROLE_NAMES ?? 10;

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    const user = member?.user ?? optionUser ?? null;

    const profile = {
        globalName: user?.globalName ?? null,
        nickname: member?.nickname ?? null,
        displayName: member?.displayName ?? user?.username ?? user?.tag ?? targetUserId,
        accountCreatedAt: user?.createdAt ?? null,
        joinedAt: member?.joinedAt ?? null,
        bot: user?.bot ?? false,
        guildName: guild.name
    };

    const roleNames = member
        ? member.roles.cache
            .filter(r => r.id !== guild.id)
            .map(r => r.name)
            .slice(0, maxRoleNames)
        : [];

    const presence = {
        status: member?.presence?.status ?? undefined,
        clients: []
    };
    if (member?.presence?.clientStatus) {
        const cs = member.presence.clientStatus;
        if (cs.desktop) presence.clients.push('desktop');
        if (cs.web) presence.clients.push('web');
        if (cs.mobile) presence.clients.push('mobile');
    }

    const { channelMessages, userActivities } = await collectGuildData(guild, {
        days,
        scope,
        channelId,
        maxMessagesPerChannel
    });

    const messages = [];
    for (const [chId, msgs] of channelMessages) {
        const channel = guild.channels.cache.get(chId);
        const channelName = channel?.name || chId;
        for (const msg of msgs) {
            if (msg.author.id !== targetUserId) continue;
            const content = (msg.content || '').trim();
            const reactions = msg.reactions?.cache
                ? Array.from(msg.reactions.cache.values()).map(r => ({
                    emoji: r.emoji.name || r.emoji.identifier || String(r.emoji),
                    count: r.count
                }))
                : [];
            messages.push({
                channelName,
                content: content || '(attachment or embed only)',
                createdAt: new Date(msg.createdTimestamp),
                isReply: !!msg.reference,
                attachmentCount: msg.attachments?.size ?? 0,
                stickerNames: msg.stickers?.map(s => s.name) || [],
                reactions: reactions.length ? reactions : undefined
            });
        }
    }
    messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const activities = (userActivities.get(targetUserId) || []).map(a => ({
        name: a.name,
        type: a.type,
        typeLabel: ACTIVITY_TYPE_LABELS[a.type] ?? `Type ${a.type}`,
        state: a.state
    }));

    const replyCount = messages.filter(m => m.isReply).length;
    const totalContentLen = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const stats = {
        messageCount: messages.length,
        avgLength: messages.length ? Math.round(totalContentLen / messages.length) : 0,
        topEmojis: topEmojisFromMessages(messages),
        linkCount: countLinks(messages),
        replyCount,
        replyRatio: messages.length ? Math.round((replyCount / messages.length) * 100) / 100 : 0,
        channelNames: [...new Set(messages.map(m => m.channelName))]
    };

    return {
        messages,
        activities,
        profile,
        roleNames,
        presence,
        stats
    };
}

module.exports = { collectUserDataForRoast };
