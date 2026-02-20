const { getSession, startSession, setListening } = require('../../abilities/voice');
const { startPipeline, stopPipeline } = require('../../abilities/voice/pipeline');
const { playInSession } = require('../../abilities/voice/play');
const { resolveVoiceChannelForMemberWithFetch } = require('../../tools/helpers/helpers');
const { getVoiceCommands } = require('./commands');

async function handleVoiceCommand(interaction, client) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'voice') return;
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: 'Use this in a server.', ephemeral: true }).catch(() => {});
        return;
    }
    const member = interaction.member;
    if (!member) {
        await interaction.reply({ content: 'Could not find you in this server.', ephemeral: true }).catch(() => {});
        return;
    }

    if (sub === 'hangout') {
        const voiceChannel = await resolveVoiceChannelForMemberWithFetch(guild, member);
        if (!voiceChannel) {
            await interaction.reply({ content: "You're not in a voice channel. Join one first.", ephemeral: true }).catch(() => {});
            return;
        }
        const session = getSession(guild.id);
        if (session) {
            await interaction.reply({ content: "I'm already in your voice channel. Use /voice start-listening if you want me to listen.", ephemeral: false }).catch(() => {});
            return;
        }
        const result = await startSession(client, guild, voiceChannel, {
            textChannelId: interaction.channel?.id ?? null,
            startListening: true,
        });
        if (!result.success) {
            await interaction.reply({ content: result.error || 'Failed to start session.', ephemeral: true }).catch(() => {});
            return;
        }
        startPipeline(result.session, client);
        try {
            await playInSession(result.session, "I'm here, listening.");
        } catch (_) {}
        await interaction.reply({ content: "I'm in your voice channel and listening. Use /voice stop-listening to pause.", ephemeral: false }).catch(() => {});
        return;
    }

    if (sub === 'start-listening') {
        const session = getSession(guild.id);
        if (!session) {
            await interaction.reply({ content: "I'm not in a voice channel. Use /voice hangout first.", ephemeral: true }).catch(() => {});
            return;
        }
        if (session.listening) {
            await interaction.reply({ content: "I'm already listening.", ephemeral: false }).catch(() => {});
            return;
        }
        setListening(guild.id, true);
        startPipeline(session, client);
        await interaction.reply({ content: 'Started listening.', ephemeral: false }).catch(() => {});
        return;
    }

    if (sub === 'stop-listening') {
        const session = getSession(guild.id);
        if (!session) {
            await interaction.reply({ content: "I'm not in a voice channel.", ephemeral: true }).catch(() => {});
            return;
        }
        if (!session.listening) {
            await interaction.reply({ content: "I'm already not listening.", ephemeral: false }).catch(() => {});
            return;
        }
        setListening(guild.id, false);
        stopPipeline(guild.id);
        await interaction.reply({ content: 'Stopped listening.', ephemeral: false }).catch(() => {});
    }
}

module.exports = {
    getVoiceCommands,
    handleVoiceCommand,
};
