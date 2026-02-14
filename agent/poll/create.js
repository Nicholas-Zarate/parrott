const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { POLL_TYPES, HEARING, THEME } = require('../config/constants');
const { getPollDescription } = require('./votes');
const { getPoll, setPoll } = require('./store');

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

async function createHearingPollMessage(interaction, { question, options, duration, anonymous }, client, endPollAuto) {
    const embed = new EmbedBuilder()
        .setTitle(`${THEME.labels.poll} [hearing] ${question}`)
        .setColor(THEME.color.primary)
        .setDescription('anyone can add options, then vote')
        .setFooter({ text: `${THEME.labels.by} ${interaction.user.tag} | ${anonymous ? THEME.labels.anonymous : THEME.labels.public}` })
        .setTimestamp();

    if (options.length > 0) {
        embed.addFields(
            options.map((opt, i) => ({ name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`, value: `0 ${THEME.labels.votes}`, inline: false }))
        );
    } else {
        embed.addFields({ name: '\u200b', value: '*no options yet — use Add option*', inline: false });
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
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        isHearing: true,
        channelId: interaction.channelId,
        duration
    };
    const rows = buildHearingRows(pollData);
    const message = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
    pollData.id = message.id;
    setPoll(message.id, pollData);

    if (duration > 0 && client && endPollAuto) {
        const channel = await client.channels.fetch(interaction.channelId);
        setTimeout(() => endPollAuto(message.id, channel), duration * 60 * 1000);
    }
}

module.exports = {
    buildHearingRows,
    createPollFromParams,
    createHearingPollMessage
};
