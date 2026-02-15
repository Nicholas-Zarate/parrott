require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const poll = require('./commands/poll');
const analysis = require('./analysis');
const roast = require('./commands/roast');
const mention = require('./mention');

/** Discord permission integer for the bot invite URL (OAuth2). Override with INVITE_PERMISSIONS in .env if needed. */
const INVITE_PERMISSIONS = process.env.INVITE_PERMISSIONS || '562955322199104';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    // Required so messageCreate fires for messages in channels the bot hasn't cached (per discord.js guide)
    partials: [Partials.Channel, Partials.Message]
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('');
    console.log('--- @mention not working? Do ALL of these ---');
    console.log('1. Developer Portal → your app → Bot → Privileged Gateway Intents → turn MESSAGE CONTENT INTENT ON, save.');
    console.log('2. OAuth2 URL Generator → Scopes: check "bot" and "applications.commands" → Bot Permissions: View Channels, Read Message History, Send Messages.');
    console.log('3. Use the Invite URL below to add/re-invite the bot (so it gets the new permissions).');
    console.log('4. Restart this bot after changing the portal.');
    console.log('---');
    const appId = client.application?.id;
    if (appId) {
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=${INVITE_PERMISSIONS}&scope=bot%20applications.commands`;
        console.log(`Invite URL (re-invite with this to fix permissions): ${inviteUrl}`);
    }
    console.log(`Guilds in cache: ${client.guilds.cache.size}`);
    client.guilds.cache.forEach((g) => {
        console.log(`  - ${g.name} (${g.id})`);
        const textChannels = g.channels.cache.filter((c) => c.isTextBased() && c.type !== 4);
        if (textChannels.size > 0) {
            textChannels.forEach((c) => console.log(`      #${c.name} (${c.id})`));
        }
    });
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

// If MENTION_DEBUG_GATEWAY=1, log raw MESSAGE_CREATE from Discord. If you see [Gateway RAW] but no [Debug] messageCreate, the client dropped the event (e.g. channel not resolved).
if (process.env.MENTION_DEBUG_GATEWAY === '1') {
    client.on('raw', (data) => {
        if (data.t === 'MESSAGE_CREATE' && data.d) {
            const d = data.d;
            const content = (d.content || '').slice(0, 60);
            console.log(`[Gateway RAW] MESSAGE_CREATE channel_id=${d.channel_id} guild_id=${d.guild_id || 'dm'} author=${d.author?.username} content="${content}${(d.content?.length || 0) > 60 ? '…' : ''}"`);
        }
    });
}

client.on('messageCreate', async (message) => {
    // Fetch partial messages so we have content and mentions (per discord.js guide)
    if (message.partial) {
        try {
            await message.fetch();
        } catch (err) {
            console.error('[messageCreate] Failed to fetch partial message:', err.message);
            return;
        }
    }
    const ch = message.channel;
    const chName = ch?.parent ? ch.parent.name : ch?.name;
    const mentionCount = message.mentions?.users?.size ?? 0;
    const botMentioned = mentionCount > 0 && message.mentions.users.has(client.user?.id);
    console.log(`[Debug] messageCreate #${chName ?? '?'} | mentions: ${mentionCount} | bot mentioned: ${botMentioned}`);
    mention.handleMention(message, client);
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
