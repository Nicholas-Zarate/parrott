const { EmbedBuilder } = require('discord.js');
const { POLL_TYPES, THEME } = require('../config/constants');

function getPollDescription(type) {
    switch (type) {
        case POLL_TYPES.SINGLE:
            return 'single choice';
        case POLL_TYPES.MULTIPLE:
            return 'multiple choice';
        case POLL_TYPES.RANKED:
            return 'ranked (order = weight)';
        case POLL_TYPES.YES_NO:
            return 'yes / no';
        default:
            return '';
    }
}

function calculateVotes(pollData) {
    const counts = {};
    pollData.options.forEach((_, i) => counts[i] = 0);

    const validIndex = (i) => typeof i === 'number' && !Number.isNaN(i) && i >= 0 && i < pollData.options.length;

    if (pollData.type === POLL_TYPES.RANKED) {
        for (const [, votes] of pollData.votes) {
            votes.forEach((optIdx, rank) => {
                if (!validIndex(optIdx)) return;
                const weight = pollData.options.length - rank;
                counts[optIdx] += weight;
            });
        }
    } else {
        for (const [, votes] of pollData.votes) {
            votes.forEach(optIdx => {
                if (validIndex(optIdx)) counts[optIdx]++;
            });
        }
    }

    return counts;
}

async function updatePollEmbed(message, pollData) {
    const voteCounts = calculateVotes(pollData);
    const totalVotes = pollData.voters.size;

    const embed = EmbedBuilder.from(message.embeds[0]);
    const full = THEME.chars.barFull;
    const empty = THEME.chars.barEmpty;
    embed.setFields(
        pollData.options.map((opt, i) => {
            const votes = voteCounts[i] || 0;
            const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
            const filled = Math.floor(percentage / 5);
            const bar = full.repeat(filled) + empty.repeat(20 - filled);
            return {
                name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`,
                value: `${bar}\n${votes} ${THEME.labels.votes} (${percentage}%)`,
                inline: false
            };
        })
    );

    embed.setFooter({ text: `${embed.data.footer?.text ?? ''} | ${totalVotes} voters` });

    await message.edit({ embeds: [embed] });
}

module.exports = { getPollDescription, calculateVotes, updatePollEmbed };
