const { EmbedBuilder } = require('discord.js');
const { THEME } = require('../../config/constants');
const { getPoll, deletePoll } = require('./store');
const { calculateVotes } = require('./votes');

async function showResultsButton(interaction, pollData, client) {
    const voteCounts = calculateVotes(pollData);
    const totalVotes = pollData.voters.size;

    let resultsText = `voters: ${totalVotes}\n\n`;

    pollData.options.forEach((opt, i) => {
        const votes = voteCounts[i] || 0;
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        resultsText += `(${i + 1}) ${opt}: ${votes} (${percentage}%)\n`;
    });

    if (!pollData.anonymous) {
        resultsText += '\n';
        for (const [userId, votes] of pollData.votes) {
            let tag = userId;
            try {
                const user = await client.users.fetch(userId);
                tag = user.tag;
            } catch (_) { /* left server or unavailable */ }
            const votedOptions = votes.map(v => pollData.options[v]).join(', ');
            resultsText += `- ${tag}: ${votedOptions}\n`;
        }
    }

    await interaction.reply({ content: resultsText, ephemeral: true });
}

async function endPollButton(interaction, client) {
    const pollData = getPoll(interaction.message.id);
    await finalizeResults(interaction.message, pollData);
    deletePoll(interaction.message.id);
    await interaction.reply({ content: 'ended.', ephemeral: true });
}

async function endPoll(interaction, client) {
    const pollId = interaction.options.getString('poll_id');
    const pollData = getPoll(pollId);

    if (!pollData) {
        return interaction.reply({ content: 'poll not found or ended.', ephemeral: true });
    }

    const channel = pollData.channelId
        ? await client.channels.fetch(pollData.channelId).catch(() => null)
        : interaction.channel;
    const message = await (channel || interaction.channel).messages.fetch(pollId).catch(() => null);
    if (!message) {
        deletePoll(pollId);
        return interaction.reply({ content: 'poll message not found (deleted?).', ephemeral: true });
    }
    await finalizeResults(message, pollData);
    deletePoll(pollId);
    await interaction.reply({ content: 'ended.', ephemeral: true });
}

function endPollAuto(pollId, channel) {
    const pollData = getPoll(pollId);
    if (!pollData) return;

    channel.messages.fetch(pollId).then(message => {
        finalizeResults(message, pollData);
        deletePoll(pollId);
    }).catch(() => {
        deletePoll(pollId);
    });
}

async function finalizeResults(message, pollData) {
    const voteCounts = calculateVotes(pollData);
    const keys = Object.keys(voteCounts).filter(k => pollData.options[k] != null);

    if (!message.embeds?.[0]) return;
    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setTitle(`${THEME.labels.ended} ${pollData.question}`);
    embed.setColor(THEME.color.ended);

    if (keys.length > 0) {
        const winner = keys.reduce((a, b) =>
            voteCounts[a] > voteCounts[b] ? a : b
        );
        embed.addFields({
            name: THEME.labels.winner,
            value: `${pollData.options[winner]} -- ${voteCounts[winner]} ${THEME.labels.votes}`
        });
    } else {
        embed.addFields({ name: THEME.labels.winner, value: '— (no votes)', inline: false });
    }

    await message.edit({ embeds: [embed], components: [] });
}

async function showResults(interaction, client) {
    const pollId = interaction.options.getString('poll_id');
    const pollData = getPoll(pollId);

    if (!pollData) {
        return interaction.reply({ content: 'poll not found.', ephemeral: true });
    }

    await showResultsButton(interaction, pollData, client);
}

module.exports = {
    showResultsButton,
    endPollButton,
    endPoll,
    endPollAuto,
    finalizeResults,
    showResults
};
