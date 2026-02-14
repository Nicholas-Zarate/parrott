const { getPollCommands } = require('./commands');
const { handleCommand, handleButton, handleModalSubmit } = require('./handlers');

function registerCommands(client) {
    return getPollCommands();
}

function isPollInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;
        return name === 'vote' || name === 'vote_hearing' || name === 'endpoll' || name === 'pollresults';
    }
    if (interaction.isButton()) {
        const id = interaction.customId || '';
        return id.startsWith('vote_') || id === 'poll_results' || id === 'poll_end' || id === 'hearing_add';
    }
    if (interaction.isModalSubmit()) {
        return interaction.customId.startsWith('hearing_modal_');
    }
    return false;
}

async function handleInteraction(interaction, client) {
    if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, client);
    } else if (interaction.isButton()) {
        await handleButton(interaction, client);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, client);
    }
}

module.exports = {
    getPollCommands,
    registerCommands,
    isPollInteraction,
    handleInteraction
};
