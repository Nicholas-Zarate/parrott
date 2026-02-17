const { resolveGuild } = require('../../util/guild');
const roastConfig = require('../../config/roast');
const { checkAndRecord } = require('./rateLimit');
const { collectUserDataForRoast } = require('./collect');
const { formatUserDataForLLM } = require('./format');
const { requestRoast, getRoastErrorMessage } = require('./openai');

/**
 * Handle /roast slash command: collect user data, format, call OpenAI, reply with roast.
 * Rate limited to config.rateLimit.maxUses per user per config.rateLimit.windowMinutes.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleRoast(interaction, client) {
    await interaction.deferReply();

    const invokerId = interaction.user.id;
    const { allowed, retryAfterSeconds } = checkAndRecord(invokerId);
    if (!allowed) {
        return interaction.editReply({
            content: `You can only use /roast ${roastConfig.rateLimit?.maxUses ?? 3} times per ${roastConfig.rateLimit?.windowMinutes ?? 5} minutes. Try again in ${retryAfterSeconds} seconds.`
        });
    }

    const targetUser = interaction.options.getUser('user', true);
    const days = interaction.options.getInteger('days') ?? roastConfig.defaultDays;
    const scope = interaction.options.getString('scope') ?? 'server';

    const guild = await resolveGuild(interaction, client);
    if (!guild) {
        return interaction.editReply({ content: 'Could not resolve server. Use this command in a server channel.' });
    }

    try {
        const channelId = scope === 'channel' ? interaction.channelId : undefined;
        const { messages, activities, profile, roleNames, presence, stats } = await collectUserDataForRoast(guild, {
            targetUserId: targetUser.id,
            targetUser,
            days,
            scope,
            channelId
        });

        if (messages.length === 0) {
            return interaction.editReply({
                content: 'No messages found for that user in the selected scope and time range.'
            });
        }

        const userDataText = formatUserDataForLLM({
            userTag: targetUser.tag,
            userId: targetUser.id,
            profile,
            roleNames,
            presence,
            activities,
            stats,
            messages,
            days,
            scope
        });

        const { content } = await requestRoast(userDataText);
        await interaction.editReply({ content: content || 'No roast generated.' });
    } catch (err) {
        console.error('Roast error:', err.message || err, err.detail || '');
        const userMsg = getRoastErrorMessage(err);
        await interaction.editReply({ content: userMsg }).catch(() => {});
    }
}

module.exports = { handleRoast };
