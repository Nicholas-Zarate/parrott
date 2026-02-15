const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } = require('discord.js');
const { POLL_TYPES, HEARING, THEME } = require('../../config/constants');
const { getPoll } = require('./store');
const { createPollFromParams, createHearingPollMessage, buildHearingRows } = require('./create');
const { updatePollEmbed } = require('./votes');
const results = require('./results');

async function handleCommand(interaction, client) {
    const { commandName } = interaction;

    const endPollAutoBound = (pollId, channel) => results.endPollAuto(pollId, channel);

    if (commandName === 'vote') {
        await createPoll(interaction, endPollAutoBound);
    } else if (commandName === 'vote_hearing') {
        await createHearingPoll(interaction, client, endPollAutoBound);
    } else if (commandName === 'endpoll') {
        await results.endPoll(interaction, client);
    } else if (commandName === 'pollresults') {
        await results.showResults(interaction, client);
    }
}

async function createPoll(interaction, endPollAuto) {
    const type = interaction.options.getString('type');
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const duration = interaction.options.getInteger('duration') || 0;
    const allowedRole = interaction.options.getRole('allowed_role');
    const anonymous = interaction.options.getBoolean('anonymous') || false;

    let options = [];
    if (type === POLL_TYPES.YES_NO) {
        options = ['Yes', 'No'];
    } else {
        if (!optionsStr) {
            return interaction.reply({ content: 'options required for this type.', ephemeral: true });
        }
        options = optionsStr.split('|').map(o => o.trim()).filter(o => o);
        if (options.length < 2) {
            return interaction.reply({ content: 'at least 2 options required.', ephemeral: true });
        }
    }

    await createPollFromParams(interaction, { type, question, options, duration, allowedRole, anonymous }, endPollAuto);
}

async function createHearingPoll(interaction, client, endPollAuto) {
    const question = interaction.options.getString('question');
    const duration = interaction.options.getInteger('duration') || 0;
    const anonymous = interaction.options.getBoolean('anonymous') || false;
    const options = [];
    await createHearingPollMessage(interaction, { question, options, duration, anonymous }, client, endPollAuto);
}

async function handleButton(interaction, client) {
    const pollData = getPoll(interaction.message.id);

    if (!pollData) {
        return interaction.reply({ content: 'poll ended or invalid.', ephemeral: true });
    }

    if (interaction.customId === 'poll_results') {
        return results.showResultsButton(interaction, pollData, client);
    }

    if (interaction.customId === 'poll_end') {
        if (interaction.user.id !== pollData.createdBy && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: 'creator or manage-messages only.', ephemeral: true });
        }
        return results.endPollButton(interaction, client);
    }

    if (interaction.customId === 'hearing_add') {
        if (!pollData.isHearing || pollData.options.length >= HEARING.MAX_OPTIONS) {
            return interaction.reply({ content: 'cannot add more options.', ephemeral: true });
        }
        const modal = new ModalBuilder()
            .setCustomId(`${HEARING.MODAL_CUSTOM_ID_PREFIX}${interaction.message.id}_${interaction.channelId}`)
            .setTitle('Add option');
        const input = new TextInputBuilder()
            .setCustomId('option_text')
            .setLabel('Option text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Option A')
            .setMaxLength(HEARING.OPTION_LABEL_MAX)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (pollData.allowedRole && !interaction.member.roles.cache.has(pollData.allowedRole)) {
        return interaction.reply({ content: 'no permission to vote.', ephemeral: true });
    }

    const optionIndex = parseInt(interaction.customId.split('_')[1], 10);
    const userId = interaction.user.id;

    if (Number.isNaN(optionIndex) || optionIndex < 0 || optionIndex >= pollData.options.length) {
        return interaction.reply({ content: 'invalid option.', ephemeral: true });
    }

    if (pollData.type === POLL_TYPES.SINGLE || pollData.type === POLL_TYPES.YES_NO) {
        pollData.votes.set(userId, [optionIndex]);
        pollData.voters.add(userId);
        await interaction.reply({ content: `voted: ${pollData.options[optionIndex]}`, ephemeral: true });
    } else if (pollData.type === POLL_TYPES.MULTIPLE) {
        let userVotes = pollData.votes.get(userId) || [];
        if (userVotes.includes(optionIndex)) {
            userVotes = userVotes.filter(v => v !== optionIndex);
            await interaction.reply({ content: `removed: ${pollData.options[optionIndex]}`, ephemeral: true });
        } else {
            userVotes.push(optionIndex);
            await interaction.reply({ content: `added: ${pollData.options[optionIndex]}`, ephemeral: true });
        }
        pollData.votes.set(userId, userVotes);
        pollData.voters.add(userId);
    } else if (pollData.type === POLL_TYPES.RANKED) {
        let userVotes = pollData.votes.get(userId) || [];
        if (!userVotes.includes(optionIndex)) {
            userVotes.push(optionIndex);
            pollData.votes.set(userId, userVotes);
            pollData.voters.add(userId);
            await interaction.reply({
                content: `ranked ${pollData.options[optionIndex]} #${userVotes.length}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({ content: 'already ranked.', ephemeral: true });
        }
    }

    await updatePollEmbed(interaction.message, pollData);
}

async function handleModalSubmit(interaction, client) {
    if (!interaction.customId.startsWith(HEARING.MODAL_CUSTOM_ID_PREFIX)) return;
    const parts = interaction.customId.split('_');
    const messageId = parts[2];
    const channelId = parts[3];
    const pollData = getPoll(messageId);
    if (!pollData || !pollData.isHearing) {
        return interaction.reply({ content: 'poll ended or invalid.', ephemeral: true });
    }
    const optionText = interaction.fields.getTextInputValue('option_text').trim();
    if (!optionText) {
        return interaction.reply({ content: 'option text cannot be empty.', ephemeral: true });
    }
    pollData.options.push(optionText);
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = EmbedBuilder.from(message.embeds[0]);
    const { calculateVotes } = require('./votes');
    const voteCounts = calculateVotes(pollData);
    const totalVotes = pollData.voters.size;
    const full = THEME.chars.barFull;
    const empty = THEME.chars.barEmpty;
    const optionFields = pollData.options.map((opt, i) => {
        const votes = voteCounts[i] || 0;
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        const filled = Math.floor(percentage / 5);
        const bar = full.repeat(filled) + empty.repeat(20 - filled);
        return { name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`, value: `${bar}\n${votes} ${THEME.labels.votes} (${percentage}%)`, inline: false };
    });
    if (pollData.duration > 0) {
        optionFields.push({ name: THEME.labels.duration, value: `${pollData.duration} min`, inline: false });
    }
    embed.setFields(optionFields);
    if (embed.data.footer?.text) {
        embed.setFooter({ text: `${embed.data.footer.text} | ${totalVotes} voters` });
    }
    await message.edit({ embeds: [embed], components: buildHearingRows(pollData) });
    await interaction.reply({ content: `added: ${optionText}`, ephemeral: true });
}

module.exports = {
    handleCommand,
    handleButton,
    handleModalSubmit
};
