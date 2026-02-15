const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { POLL_TYPES, HEARING } = require('../../config/constants');

function getPollCommands() {
    return [
        new SlashCommandBuilder()
            .setName('vote')
            .setDescription('Create a new poll')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of poll')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Single Choice', value: POLL_TYPES.SINGLE },
                        { name: 'Multiple Choice', value: POLL_TYPES.MULTIPLE },
                        { name: 'Ranked Choice', value: POLL_TYPES.RANKED },
                        { name: 'Yes/No', value: POLL_TYPES.YES_NO }
                    ))
            .addStringOption(option =>
                option.setName('question')
                    .setDescription('The poll question')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('options')
                    .setDescription('Poll options separated by | (e.g., Option1|Option2|Option3)')
                    .setRequired(false))
            .addIntegerOption(option =>
                option.setName('duration')
                    .setDescription('Poll duration in minutes (0 for no limit)')
                    .setRequired(false))
            .addRoleOption(option =>
                option.setName('allowed_role')
                    .setDescription('Role required to vote (leave empty for everyone)')
                    .setRequired(false))
            .addBooleanOption(option =>
                option.setName('anonymous')
                    .setDescription('Hide voter names')
                    .setRequired(false)),
        new SlashCommandBuilder()
            .setName('endpoll')
            .setDescription('End an active poll')
            .addStringOption(option =>
                option.setName('poll_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder()
            .setName('pollresults')
            .setDescription('Show detailed poll results')
            .addStringOption(option =>
                option.setName('poll_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('vote_hearing')
            .setDescription('Poll where any user can add options, then vote')
            .addStringOption(option =>
                option.setName('question')
                    .setDescription('The question or topic')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('duration')
                    .setDescription('Duration in minutes (0 = no limit)')
                    .setRequired(false))
            .addBooleanOption(option =>
                option.setName('anonymous')
                    .setDescription('Hide voter names')
                    .setRequired(false))
    ];
}

module.exports = { getPollCommands };
