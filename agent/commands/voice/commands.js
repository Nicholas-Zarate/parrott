const { SlashCommandBuilder } = require('discord.js');

function getVoiceCommands() {
    return [
        new SlashCommandBuilder()
            .setName('voice')
            .setDescription('Voice session: hang out in VC, start or stop listening')
            .addSubcommand((sc) =>
                sc
                    .setName('hangout')
                    .setDescription('Join your voice channel and stay, start listening (STT)'))
            .addSubcommand((sc) =>
                sc
                    .setName('start-listening')
                    .setDescription('Turn listening on (if already in VC)'))
            .addSubcommand((sc) =>
                sc
                    .setName('stop-listening')
                    .setDescription('Turn listening off (if in VC)')),
    ];
}

module.exports = { getVoiceCommands };
