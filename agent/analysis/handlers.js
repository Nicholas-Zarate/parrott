const { EmbedBuilder } = require('discord.js');
const { THEME } = require('../config/constants');
const { ANALYSIS } = require('../config/constants');
const { collectGuildData } = require('./collector');
const { buildFullReport, buildMinimalReport } = require('./report');

const EMBED_FIELD_MAX = 1024;

function truncate(str, max = EMBED_FIELD_MAX) {
    if (typeof str !== 'string') return str;
    return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

async function resolveGuild(interaction, client) {
    console.log(`resolveGuild: guildId=${interaction.guildId}, channelId=${interaction.channelId}, guild cached=${!!interaction.guild}, guilds in cache=${client.guilds.cache.size}`);
    if (interaction.guild) return interaction.guild;
    if (!interaction.guildId) return null;
    // Fetch the channel the command was run in — the bot always has access to it
    try {
        const channel = await client.channels.fetch(interaction.channelId);
        console.log(`resolveGuild: channel fetch OK, guild from channel=${!!channel?.guild}`);
        if (channel?.guild) return channel.guild;
    } catch (e) {
        console.error('resolveGuild via channel failed:', e.message || e);
    }
    // Last resort: direct guild fetch
    try {
        const g = await client.guilds.fetch(interaction.guildId);
        console.log('resolveGuild: guilds.fetch OK');
        return g;
    } catch (e) {
        console.error('resolveGuild via guilds.fetch failed:', e.message || e);
    }
    return null;
}

async function handleAnalysis(interaction, client) {
    const scope = interaction.options.getString('scope') || 'channel';
    const days = interaction.options.getInteger('days') || ANALYSIS.DEFAULT_DAYS;
    const maxMessages = interaction.options.getInteger('max_messages') || ANALYSIS.DEFAULT_MAX_MESSAGES_PER_CHANNEL;

    await interaction.deferReply({ ephemeral: true });

    const guild = await resolveGuild(interaction, client);
    if (!guild) {
        return interaction.editReply({ content: 'Could not resolve server. Make sure this command is used in a server channel.' });
    }

    try {
        const channelId = scope === 'channel' ? interaction.channelId : undefined;
        const { channelMessages, userActivities, after } = await collectGuildData(guild, {
            days,
            maxMessagesPerChannel: maxMessages,
            scope,
            channelId
        });

        const fullReport = buildFullReport(channelMessages, userActivities, { guild, days, after });
        const embed = formatFullReportEmbed(fullReport);
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('Analysis error:', err);
        await interaction.editReply({ content: `Analysis failed: ${err.message || 'unknown error'}.` }).catch(() => {});
    }
}

async function handleAnalysisMini(interaction, client) {
    const scope = interaction.options.getString('scope') || 'channel';
    const days = interaction.options.getInteger('days') || ANALYSIS.DEFAULT_DAYS;

    await interaction.deferReply({ ephemeral: true });

    const guild = await resolveGuild(interaction, client);
    if (!guild) {
        return interaction.editReply({ content: 'Could not resolve server. Make sure this command is used in a server channel.' });
    }

    try {
        const channelId = scope === 'channel' ? interaction.channelId : undefined;
        const { channelMessages, userActivities } = await collectGuildData(guild, {
            days,
            scope,
            channelId
        });

        const fullReport = buildFullReport(channelMessages, userActivities, {
            guild,
            days,
            after: Date.now() - days * 24 * 60 * 60 * 1000
        });
        const minimal = buildMinimalReport(fullReport);
        const embed = formatMinimalReportEmbed(minimal);
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('Analysis mini error:', err);
        await interaction.editReply({ content: `Analysis failed: ${err.message || 'unknown error'}.` }).catch(() => {});
    }
}

function formatFullReportEmbed(report) {
    const embed = new EmbedBuilder()
        .setTitle(`[ANALYSIS] ${report.guildName}`)
        .setColor(THEME.color.primary)
        .setDescription(`Last **${report.timeRange.days}** day(s) · ${report.totalMessages} messages · ${report.uniqueUsers} users`)
        .setTimestamp();

    if (report.messagesPerDay != null) {
        embed.addFields({ name: 'Messages/day', value: String(report.messagesPerDay), inline: true });
    }

    const channelList = truncate(
        report.channelStats
            .slice(0, 15)
            .map(c => `**#${c.channelName}** ${c.messageCount} msgs, ${c.uniqueAuthors} users`)
            .join('\n') || '—'
    );
    embed.addFields({ name: 'Channels', value: channelList, inline: false });

    const userList = truncate(
        report.userStats
            .slice(0, 15)
            .map(u => `**${u.userTag}** ${u.messageCount}${u.charCount != null ? ` (${u.charCount} chars)` : ''}`)
            .join('\n') || '—'
    );
    embed.addFields({ name: 'Users', value: userList, inline: false });

    if (report.activityCounts && Object.keys(report.activityCounts).length > 0) {
        const activityList = truncate(
            Object.entries(report.activityCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => `${name}: ${count}`)
                .join('\n')
        );
        embed.addFields({ name: 'Activity (games/apps)', value: activityList, inline: false });
    }

    if (report.peakActivity && report.totalMessages > 0) {
        const { byHour, byDay } = report.peakActivity;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const topHours = byHour
            .map((count, hour) => ({ hour, count }))
            .filter(({ count }) => count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(({ hour, count }) => `${hour.toString().padStart(2, '0')}:00 (${count})`)
            .join(', ');
        const dayLine = dayNames.map((name, i) => `${name} ${byDay[i] || 0}`).join(' · ');
        const peakValue = truncate(`**By hour (UTC)** Top: ${topHours || '—'}\n**By day** ${dayLine}`);
        embed.addFields({ name: 'Peak activity', value: peakValue, inline: false });
    }

    return embed;
}

function formatMinimalReportEmbed(minimal) {
    const embed = new EmbedBuilder()
        .setTitle('[ANALYSIS] summary')
        .setColor(THEME.color.primary)
        .setDescription(`${minimal.timeRangeSummary}\n**${minimal.totalMessages}** messages · **${minimal.uniqueUsers}** users`)
        .setTimestamp();

    const channelList = truncate(minimal.topChannels.map(c => `#${c.channelName} (${c.messageCount})`).join(' · ') || '—');
    embed.addFields({ name: 'Top channels', value: channelList, inline: false });

    const userList = truncate(minimal.topUsers.map(u => `${u.userTag} (${u.messageCount})`).join(' · ') || '—');
    embed.addFields({ name: 'Top users', value: userList, inline: false });

    embed.addFields({ name: 'Activity', value: truncate(minimal.activitySummary || '—'), inline: false });

    return embed;
}

module.exports = { handleAnalysis, handleAnalysisMini };
