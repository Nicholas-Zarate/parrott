const roastConfig = require('../../config/roast');

/**
 * Format user data into a single LLM-ingestible text block.
 * When messageContextOnly is true, only identity + message-derived stats + messages are included (no roles, presence, activities, or extra profile).
 * Order: USER & PROFILE [or minimal identity] → [ROLES] → [PRESENCE] → BEHAVIOR/STATS → MESSAGES.
 * Applies per-message and total character caps from config.
 * @param {Object} params
 * @param {string} params.userTag
 * @param {string} params.userId
 * @param {Object} params.profile - globalName, nickname, displayName, accountCreatedAt, joinedAt, bot, guildName
 * @param {string[]} params.roleNames
 * @param {Object} params.presence - status, clients[]
 * @param {Array<{ name: string, typeLabel: string, state?: string }>} params.activities
 * @param {Object} params.stats - messageCount, avgLength, topEmojis, linkCount, replyCount, replyRatio, channelNames
 * @param {Array<{ channelName: string, content: string, createdAt: Date, isReply?: boolean, attachmentCount?: number, stickerNames?: string[], reactions?: Array<{ emoji: string, count: number }> }>} params.messages
 * @param {number} params.days
 * @param {string} params.scope
 * @param {boolean} [params.messageContextOnly] - If true, only include message-related context and minimal identity (no roles, presence, activities, or extra profile).
 * @returns {string}
 */
function formatUserDataForLLM({ userTag, userId, profile, roleNames, presence, activities, stats, messages, days, scope, messageContextOnly }) {
    const maxMsgLen = roastConfig.MAX_MESSAGE_LENGTH;
    const maxTotal = roastConfig.MAX_USER_DATA_CHARS;
    const maxCtxLen = roastConfig.MAX_MESSAGE_CONTEXT_LENGTH ?? 60;

    const lines = [];

    // --- USER & PROFILE (minimal when messageContextOnly) ---
    lines.push(`USER: ${userTag} (ID: ${userId})`);
    if (!messageContextOnly) {
        lines.push(`Server: ${profile.guildName}`);
    }
    lines.push(`Display name: ${profile.displayName}`);
    if (!messageContextOnly) {
        if (profile.nickname != null && profile.nickname !== profile.displayName) {
            lines.push(`Nickname: ${profile.nickname}`);
        }
        if (profile.globalName != null && profile.globalName !== profile.displayName) {
            lines.push(`Global name: ${profile.globalName}`);
        }
        if (profile.joinedAt) {
            lines.push(`Joined server: ${profile.joinedAt.toISOString().slice(0, 10)}`);
        }
        if (profile.accountCreatedAt) {
            lines.push(`Account created: ${profile.accountCreatedAt.toISOString().slice(0, 10)}`);
        }
        lines.push(`Bot: ${profile.bot ? 'yes' : 'no'}`);
    }
    lines.push('');

    // --- ROLES (skip when messageContextOnly) ---
    if (!messageContextOnly) {
        lines.push('ROLES:');
        lines.push(roleNames.length ? roleNames.join(', ') : 'none');
        lines.push('');

        // --- PRESENCE (status, devices, activities) ---
        lines.push('PRESENCE:');
        if (presence.status) {
            const clients = presence.clients?.length ? ` (${presence.clients.join(', ')})` : '';
            lines.push(`Status: ${presence.status}${clients}`);
        }
        if (activities.length > 0) {
            for (const a of activities) {
                const state = a.state ? ` — ${a.state}` : '';
                lines.push(`- ${a.typeLabel} ${a.name}${state}`);
            }
        }
        if (!presence.status && activities.length === 0) {
            lines.push('none');
        }
        lines.push('');
    }

    // --- BEHAVIOR / STATS (message-derived; keep for both modes) ---
    lines.push('BEHAVIOR (this window):');
    lines.push(`Messages: ${stats.messageCount}`);
    lines.push(`Avg message length: ${stats.avgLength} chars`);
    if (stats.topEmojis.length) {
        lines.push(`Top emojis: ${stats.topEmojis.join(' ')}`);
    }
    lines.push(`Links shared: ${stats.linkCount}`);
    lines.push(`Reply ratio: ${stats.replyRatio} (${stats.replyCount}/${stats.messageCount} were replies)`);
    if (stats.channelNames.length) {
        lines.push(`Channels posted in: #${stats.channelNames.join(', #')}`);
    }
    lines.push('');

    // --- MESSAGES ---
    lines.push(`MESSAGES (last ${days} day(s), scope: ${scope}):`);
    if (messages.length === 0) {
        lines.push('(no messages)');
    } else {
        let totalLen = lines.join('\n').length;
        for (const m of messages) {
            const content = m.content.length > maxMsgLen ? m.content.slice(0, maxMsgLen) + '…' : m.content;
            const dateStr = m.createdAt.toISOString().slice(0, 16).replace('T', ' ');
            let line = `[#${m.channelName}] ${dateStr} — ${content}`;

            const ctxParts = [];
            if (m.isReply) ctxParts.push('reply');
            if (m.attachmentCount > 0) ctxParts.push(`${m.attachmentCount} attachment(s)`);
            if (m.stickerNames?.length) ctxParts.push(`sticker: ${m.stickerNames[0]}`);
            if (m.reactions?.length) {
                const rStr = m.reactions.map(r => `${r.emoji}×${r.count}`).join(', ').slice(0, 30);
                ctxParts.push(`reactions: ${rStr}`);
            }
            if (ctxParts.length) {
                const suffix = ` (${ctxParts.join(', ')})`;
                const capped = suffix.length > maxCtxLen ? suffix.slice(0, maxCtxLen - 3) + '…)' : suffix;
                line += capped;
            }

            if (totalLen + line.length + 1 > maxTotal) {
                lines.push('… (truncated)');
                break;
            }
            lines.push(line);
            totalLen += line.length + 1;
        }
    }

    const out = lines.join('\n');
    return out.length > maxTotal ? out.slice(0, maxTotal) + '…' : out;
}

/**
 * Format minimal user + activities only (for game_streak roast type). No messages or stats.
 * @param {Object} params
 * @param {string} params.userTag
 * @param {string} params.displayName
 * @param {Array<{ name: string, typeLabel: string, state?: string }>} params.activities
 * @returns {string}
 */
function formatActivityOnlyForLLM({ userTag, displayName, activities }) {
    const lines = [];
    lines.push(`USER: ${userTag}`);
    lines.push(`Display name: ${displayName}`);
    lines.push('ACTIVITIES (current):');
    if (activities.length === 0) {
        lines.push('none');
    } else {
        for (const a of activities) {
            const state = a.state ? ` — ${a.state}` : '';
            lines.push(`- ${a.typeLabel} ${a.name}${state}`);
        }
    }
    return lines.join('\n');
}

module.exports = { formatUserDataForLLM, formatActivityOnlyForLLM };
