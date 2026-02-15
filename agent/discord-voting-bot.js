require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const poll = require('./poll');
const analysis = require('./analysis');
const roast = require('./roast');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Guilds in cache: ${client.guilds.cache.size}`);
    client.guilds.cache.forEach(g => console.log(`  - ${g.name} (${g.id})`));
    const pollCommands = poll.getPollCommands();
    const analysisCommandsList = analysis.getAnalysisCommands();
    const roastCommandsList = roast.getRoastCommands();
    const allCommands = [...pollCommands, ...analysisCommandsList, ...roastCommandsList];
    try {
        await client.application.commands.set(allCommands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;
        if (name === 'analysis') {
            return analysis.handleAnalysis(interaction, client);
        }
        if (name === 'analysis_mini') {
            return analysis.handleAnalysisMini(interaction, client);
        }
        if (name === 'roast') {
            return roast.handleRoast(interaction, client);
        }
    }

    if (poll.isPollInteraction(interaction)) {
        return poll.handleInteraction(interaction, client);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN || 'MTQ3MTczMDcyMDAxNDYwMjI4MA.GT0Oxx.NFYEnyow6Vn9100w5M9O5XtrwC9pA33QYADTD8');
