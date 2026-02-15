const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { POLL_TYPES, HEARING, THEME } = require('../../config/constants');
const { getPollDescription } = require('./votes');
const { setPoll } = require('./store');
const results = require('./results');

function buildHearingRows(pollData) {
    const options = pollData.options;
    const buttons = options.map((opt, i) =>
        new ButtonBuilder()
            .setCustomId(`vote_${i}`)
            .setLabel(String(i + 1))
            .setStyle(ButtonStyle.Secondary)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    const controlButtons = [
        new ButtonBuilder().setCustomId('poll_results').setLabel('Results').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('poll_end').setLabel('End').setStyle(ButtonStyle.Danger)
    ];
    if (pollData.isHearing && options.length < HEARING.MAX_OPTIONS) {
        controlButtons.unshift(
            new ButtonBuilder().setCustomId('hearing_add').setLabel('Add option').setStyle(ButtonStyle.Primary)
        );
    }
    rows.push(new ActionRowBuilder().addComponents(controlButtons));
    return rows;
}

async function createPollFromParams(interaction, { type, question, options, duration, allowedRole, anonymous }, endPollAuto) {
    const embed = new EmbedBuilder()
        .setTitle(`${THEME.labels.poll} ${question}`)
        .setColor(THEME.color.primary)
        .setDescription(getPollDescription(type))
        .addFields(
            options.map((opt, i) => ({ name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`, value: `0 ${THEME.labels.votes}`, inline: false }))
        )
        .setFooter({ text: `${THEME.labels.by} ${interaction.user.tag} | ${anonymous ? THEME.labels.anonymous : THEME.labels.public}` })
        .setTimestamp();

    if (allowedRole) {
        embed.addFields({ name: THEME.labels.lock, value: `${allowedRole}` });
    }

    if (duration > 0) {
        embed.addFields({ name: THEME.labels.duration, value: `${duration} min` });
    }

    const buttons = options.map((opt, i) =>
        new ButtonBuilder()
            .setCustomId(`vote_${i}`)
            .setLabel(String(i + 1))
            .setStyle(ButtonStyle.Secondary)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poll_results')
            .setLabel('Results')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('poll_end')
            .setLabel('End')
            .setStyle(ButtonStyle.Danger)
    );
    rows.push(controlRow);

    const message = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });

    const pollData = {
        id: message.id,
        question,
        type,
        options,
        votes: new Map(),
        voters: new Set(),
        allowedRole: allowedRole?.id,
        anonymous,
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        channelId: interaction.channelId
    };

    setPoll(message.id, pollData);

    if (duration > 0 && endPollAuto) {
        setTimeout(() => endPollAuto(message.id, interaction.channel), duration * 60 * 1000);
    }
}

/**
 * Build embed, pollData (id set to null), and button rows for a hearing poll.
 * Used by both slash-command and channel (e.g. mention/tool) flows.
 * @param {string} question
 * @param {string[]} options
 * @param {number} duration - minutes, 0 = no limit
 * @param {boolean} anonymous
 * @param {string} userTag - creator display (e.g. user.tag)
 * @param {string} userId - creator Discord ID
 * @param {string} channelId
 * @returns {{ embed: EmbedBuilder, pollData: object, rows: ActionRowBuilder[] }}
 */
function buildHearingPollContent(question, options, duration, anonymous, userTag, userId, channelId) {
    const embed = new EmbedBuilder()
        .setTitle(question)
        .setColor(THEME.color.hearing ?? THEME.color.primary)
        .setDescription(`${THEME.labels.poll} [hearing]\n\nPRESS ADD OPTION`)
        .setFooter({ text: `${THEME.labels.by} ${userTag} | ${anonymous ? THEME.labels.anonymous : THEME.labels.public}` })
        .setTimestamp();

    if (options.length > 0) {
        embed.addFields(
            options.map((opt, i) => ({ name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`, value: `0 ${THEME.labels.votes}`, inline: false }))
        );
    }
    if (duration > 0) {
        embed.addFields({ name: THEME.labels.duration, value: `${duration} min` });
    }

    const pollData = {
        id: null,
        question,
        type: POLL_TYPES.SINGLE,
        options: [...options],
        votes: new Map(),
        voters: new Set(),
        allowedRole: null,
        anonymous,
        createdBy: userId,
        createdAt: Date.now(),
        isHearing: true,
        channelId,
        duration
    };
    const rows = buildHearingRows(pollData);
    return { embed, pollData, rows };
}

async function createHearingPollMessage(interaction, { question, options, duration, anonymous }, client, endPollAuto) {
    const { embed, pollData, rows } = buildHearingPollContent(
        question,
        options ?? [],
        duration ?? 0,
        anonymous ?? false,
        interaction.user.tag,
        interaction.user.id,
        interaction.channelId
    );
    const message = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
    pollData.id = message.id;
    setPoll(message.id, pollData);

    if (duration > 0 && client && endPollAuto) {
        const channel = await client.channels.fetch(interaction.channelId);
        setTimeout(() => endPollAuto(message.id, channel), duration * 60 * 1000);
    }
}

/**
 * Create a hearing poll by sending a message in the given channel (e.g. when triggered via @mention/tool).
 * Same behavior as /vote_hearing but without a slash interaction.
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').User} user - creator
 * @param {{ question: string, duration?: number, anonymous?: boolean }} params
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function createHearingPollInChannel(channel, user, { question, duration = 0, anonymous = false }, client) {
    const options = [];
    const { embed, pollData, rows } = buildHearingPollContent(
        question,
        options,
        duration,
        anonymous,
        user.tag,
        user.id,
        channel.id
    );
    const message = await channel.send({ embeds: [embed], components: rows });
    pollData.id = message.id;
    setPoll(message.id, pollData);

    if (duration > 0 && client) {
        setTimeout(() => results.endPollAuto(message.id, channel), duration * 60 * 1000);
    }
    return { success: true, messageId: message.id };
}

module.exports = {
    buildHearingRows,
    buildHearingPollContent,
    createPollFromParams,
    createHearingPollMessage,
    createHearingPollInChannel
};
