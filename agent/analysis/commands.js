const { SlashCommandBuilder } = require('discord.js');
const { ANALYSIS } = require('../config/constants');

function getAnalysisCommands() {
    return [
        new SlashCommandBuilder()
            .setName('analysis')
            .setDescription('Full server/channel analysis (messages and activity)')
            .addStringOption(option =>
                option.setName('scope')
                    .setDescription('Analyze this channel or whole server')
                    .setRequired(false)
                    .addChoices(
                        { name: 'This channel', value: 'channel' },
                        { name: 'Whole server', value: 'server' }
                    ))
            .addIntegerOption(option =>
                option.setName('days')
                    .setDescription(`Days to look back (1–${ANALYSIS.MAX_DAYS}, default ${ANALYSIS.DEFAULT_DAYS})`)
                    .setRequired(false)
                    .setMinValue(ANALYSIS.MIN_DAYS)
                    .setMaxValue(ANALYSIS.MAX_DAYS))
            .addIntegerOption(option =>
                option.setName('max_messages')
                    .setDescription('Max messages per channel (default 500)')
                    .setRequired(false)
                    .setMinValue(50)
                    .setMaxValue(2000)),
        new SlashCommandBuilder()
            .setName('analysis_mini')
            .setDescription('Short summary: top channels, top users, activity')
            .addStringOption(option =>
                option.setName('scope')
                    .setDescription('Analyze this channel or whole server')
                    .setRequired(false)
                    .addChoices(
                        { name: 'This channel', value: 'channel' },
                        { name: 'Whole server', value: 'server' }
                    ))
            .addIntegerOption(option =>
                option.setName('days')
                    .setDescription(`Days to look back (1–${ANALYSIS.MAX_DAYS}, default ${ANALYSIS.DEFAULT_DAYS})`)
                    .setRequired(false)
                    .setMinValue(ANALYSIS.MIN_DAYS)
                    .setMaxValue(ANALYSIS.MAX_DAYS))
    ];
}

module.exports = { getAnalysisCommands };
