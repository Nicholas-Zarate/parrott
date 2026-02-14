const { ANALYSIS } = require('../config/constants');

/**
 * Build full analysis report from collected data.
 * @param {Map<string, import('discord.js').Message[]>} channelMessages
 * @param {Map<string, Array<{name: string, type: number, state?: string}>} userActivities
 * @param {Object} options
 * @param {import('discord.js').Guild} options.guild
 * @param {number} options.days
 * @param {number} options.after - Timestamp cutoff
 * @returns {import('./types').AnalysisReport}
 */
function buildFullReport(channelMessages, userActivities, { guild, days, after }) {
    const channelStats = [];
    const userCounts = new Map();
    const userChars = new Map();
    let totalMessages = 0;

    const userTags = new Map();
    for (const [, messages] of channelMessages) {
        for (const msg of messages) {
            if (msg.author.bot) continue;
            if (!userTags.has(msg.author.id)) userTags.set(msg.author.id, msg.author.tag);
        }
    }

    for (const [chId, messages] of channelMessages) {
        const channel = guild.channels.cache.get(chId);
        const name = channel?.name || chId;
        const authors = new Set();
        for (const msg of messages) {
            if (msg.author.bot) continue;
            totalMessages++;
            authors.add(msg.author.id);
            userCounts.set(msg.author.id, (userCounts.get(msg.author.id) || 0) + 1);
            if (msg.content) {
                userChars.set(msg.author.id, (userChars.get(msg.author.id) || 0) + msg.content.length);
            }
        }
        channelStats.push({
            channelId: chId,
            channelName: name,
            messageCount: messages.filter(m => !m.author.bot).length,
            uniqueAuthors: authors.size
        });
    }

    channelStats.sort((a, b) => b.messageCount - a.messageCount);

    const userStats = [];
    const userIds = new Set(userCounts.keys());
    for (const uid of userIds) {
        userStats.push({
            userId: uid,
            userTag: userTags.get(uid) || uid,
            messageCount: userCounts.get(uid) || 0,
            charCount: userChars.get(uid)
        });
    }
    userStats.sort((a, b) => b.messageCount - a.messageCount);

    const activityCounts = {};
    for (const [, activities] of userActivities) {
        for (const a of activities) {
            activityCounts[a.name] = (activityCounts[a.name] || 0) + 1;
        }
    }

    // Peak activity: bucket by hour (0-23) and day (0=Sun .. 6=Sat) UTC
    const byHour = Array(24).fill(0);
    const byDay = Array(7).fill(0);
    for (const [, messages] of channelMessages) {
        for (const msg of messages) {
            if (msg.author.bot) continue;
            const d = new Date(msg.createdTimestamp);
            byHour[d.getUTCHours()]++;
            byDay[d.getUTCDay()]++;
        }
    }

    const daysNum = days || 7;
    return {
        timeRange: { days: daysNum, maxMessagesPerChannel: ANALYSIS.DEFAULT_MAX_MESSAGES_PER_CHANNEL },
        guildId: guild.id,
        guildName: guild.name,
        totalMessages,
        uniqueUsers: userStats.length,
        messagesPerDay: daysNum > 0 ? Math.round(totalMessages / daysNum * 10) / 10 : 0,
        channelStats,
        userStats,
        userActivities: userActivities.size ? Object.fromEntries(userActivities) : undefined,
        activityCounts: Object.keys(activityCounts).length ? activityCounts : undefined,
        peakActivity: { byHour, byDay }
    };
}

/**
 * Build minimal analysis report.
 * @param {import('./types').AnalysisReport} fullReport
 * @returns {import('./types').AnalysisReportMinimal}
 */
function buildMinimalReport(fullReport) {
    const n = ANALYSIS.TOP_N_MINIMAL;
    const topChannels = fullReport.channelStats.slice(0, n);
    const topUsers = fullReport.userStats.slice(0, n);
    let activitySummary = '';
    if (fullReport.activityCounts && Object.keys(fullReport.activityCounts).length > 0) {
        const top = Object.entries(fullReport.activityCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => `${name} (${count})`)
            .join(', ');
        activitySummary = top || 'none';
    } else {
        activitySummary = 'no presence data';
    }

    return {
        totalMessages: fullReport.totalMessages,
        uniqueUsers: fullReport.uniqueUsers,
        topChannels,
        topUsers,
        activitySummary,
        timeRangeSummary: `Last ${fullReport.timeRange.days} day(s)`
    };
}

module.exports = { buildFullReport, buildMinimalReport };
