require('dotenv').config();
const { patchConsole } = require('./database/supabase/logs');
patchConsole();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const poll = require('./commands/poll');
const analysis = require('./analysis');
const roast = require('./commands/roast');
const voice = require('./commands/voice');
const mention = require('./abilities/mention');
const { isBotMentionedInContent } = require('./abilities/mention/format');
const { startScheduler } = require('./jobs/scheduler');
const { startRestartRequestConsumer } = require('./jobs/restart-request-consumer');
const { handlePresenceUpdate, handleVoiceStateUpdate, init: initActivityListener } = require('./activity/listener');

/** Discord permission integer for the bot invite URL (OAuth2). Override with INVITE_PERMISSIONS in .env if needed. Voice (squawk) needs Connect + Speak; re-invite with permissions that include those if the bot cannot join VC. */
const INVITE_PERMISSIONS = process.env.INVITE_PERMISSIONS || '562955322199104';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
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
    const voiceCommandsList = voice.getVoiceCommands();
    const allCommands = [...pollCommands, ...analysisCommandsList, ...roastCommandsList, ...voiceCommandsList];
    try {
        await client.application.commands.set(allCommands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    const parrotConfig = require('./config/parrot');
    if (process.env.SUPABASE_URL?.trim() && (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim())) {
        await parrotConfig.refreshPromptConfig();
    }

    // Start periodic jobs (announcements every 6h). Safe to call once.
    startScheduler();

    // Initialize activity listener (presenceUpdate triggers).
    initActivityListener();

    // Poll restart_requests and send to Discord (voice or #parrot).
    startRestartRequestConsumer(client);
    // Request guild members with presences so the gateway sends us presenceUpdate events (e.g. streaming).
    // Without this, Discord often does not send presence for members in larger/lazy-loaded guilds.
    for (const [guildId, guild] of client.guilds.cache) {
        guild.members
            .fetch({ query: '', limit: 0, withPresences: true })
            .then((members) => {
                console.log(`[presence] Requested members with presences for ${guild.name}: ${members.size} members. You should now receive presenceUpdate when they stream.`);
            })
            .catch((err) => {
                console.error(`[presence] Failed to request members for ${guild.name}:`, err.message || err);
            });
    }
    // All console.log/warn/error are sent to terminal and to Supabase (logs table) via patchConsole().
    console.log('[Logs] Console output is sent to this terminal AND to Supabase table "logs". Check both to verify.');
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
    // Fetch partial channel so allowlist can read channel.name (first message in an uncached channel would otherwise fail)
    if (message.channel?.partial) {
        try {
            await message.channel.fetch();
        } catch (err) {
            console.error('[messageCreate] Failed to fetch partial channel:', err.message);
            return;
        }
    }
    const ch = message.channel;
    const chName = ch?.parent ? ch.parent.name : ch?.name;
    const mentionCount = message.mentions?.users?.size ?? 0;
    const content = message.content ?? '';
    const botId = client.user?.id;
    const fromContent = isBotMentionedInContent(content, botId);
    const fromMentions = mentionCount > 0 && message.mentions.users.has(botId);
    let fromRole = false;
    try {
        fromRole = await mention.isBotMentionedByRole(message, client);
    } catch (e) {
        console.error('[messageCreate] isBotMentionedByRole error:', e?.message);
    }
    const botMentioned = fromContent || fromMentions || fromRole;

    // Diagnostic when there are user/role mentions but we didn't detect the bot (so we can see why).
    // Skip for any bot message (our reply "juan second..." triggers messageCreate with botMentioned=false).
    const isBotMessage = message.author?.bot === true || message.author?.id === botId;
    const hasAnyMentions = mentionCount > 0 || (message.mentions?.roles?.size ?? 0) > 0;
    if (!isBotMessage && hasAnyMentions && !botMentioned) {
        const preview = content.length === 0 ? '(empty)' : content.slice(0, 120).replace(/\n/g, ' ');
        console.log(`[Debug] mention check failed | content length: ${content.length} | content preview: ${preview} | bot id: ${botId ?? 'missing'}`);
        if (content.length === 0) {
            console.log('[Debug] Message content is empty. Enable "Message Content Intent" in Developer Portal → your app → Bot → Privileged Gateway Intents, then re-invite the bot.');
        }
    }

    const authorLabel = message.author?.username ?? message.author?.id ?? '?';
    console.log(`[Debug] messageCreate #${chName ?? '?'} @${authorLabel} | mentions (API): ${mentionCount} | bot mentioned: ${botMentioned}`);
    mention.handleMention(message, client);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
    // Minimal diagnostic (appears in terminal and Supabase via patchConsole): confirm we receive the event at all.
    const uid = newPresence?.userId ?? '?';
    const gid = newPresence?.guild?.id ?? 'null';
    console.log('[presenceUpdate] received: userId=' + uid + ' guildId=' + gid);
    handlePresenceUpdate(oldPresence, newPresence, client).catch((err) => {
        console.error('[presenceUpdate] Unhandled error:', err.message || err);
    });
});

client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState, client).catch((err) => {
        console.error('[voiceStateUpdate] Unhandled error:', err.message || err);
    });
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
        if (name === 'voice') {
            return voice.handleVoiceCommand(interaction, client);
        }
    }

    if (poll.isPollInteraction(interaction)) {
        return poll.handleInteraction(interaction, client);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
