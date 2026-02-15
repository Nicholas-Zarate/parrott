const { SlashCommandBuilder } = require('discord.js');
const roastConfig = require('../config/roast');

function getRoastCommands() {
    return [
        new SlashCommandBuilder()
            .setName('roast')
            .setDescription('Generate a short roast of a user based on their recent messages and activity')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to roast')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('days')
                    .setDescription(`Days of history to use (${roastConfig.minDays}–${roastConfig.maxDays}, default ${roastConfig.defaultDays})`)
                    .setRequired(false)
                    .setMinValue(roastConfig.minDays)
                    .setMaxValue(roastConfig.maxDays))
            .addStringOption(option =>
                option.setName('scope')
                    .setDescription('Use messages from this channel or whole server')
                    .setRequired(false)
                    .addChoices(
                        { name: 'This channel', value: 'channel' },
                        { name: 'Whole server', value: 'server' }
                    ))
    ];
}

module.exports = { getRoastCommands };
