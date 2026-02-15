const { isChannelAllowed } = require('./config');
const { buildUserContentForParrot } = require('./format');
const parrotConfig = require('../config/parrot');
const { getOpenAIErrorMessage } = require('../commands/roast/openai');
const { chatWithTools } = require('../ai-sdk/with-tools');
const { saveConversation, getToolsCalledFromSteps } = require('../supabase/conversation-history');

/**
 * Runs when someone mentions the bot in an allowed channel.
 * Uses chatWithTools so the parrot can run commands (e.g. create_hearing_poll, run_roast).
 * Expects message to be full (not partial); discord-voting-bot.js fetches partials before calling.
 * Terminal logs: [Mention] and [Parrott tools] for debugging and to guide users when params are missing.
 *
 * @param {import('discord.js').Message} message - The message that mentioned the bot
 * @param {import('discord.js').Client} client - The bot client
 */
async function onMention(message, client) {
    const channelName = message.channel?.name ?? 'dm';
    const authorTag = message.author?.tag ?? message.author?.id ?? 'unknown';
    console.log(`[Mention] #${channelName} @${authorTag}: ${message.content ?? '(no content)'}`);

    if (!process.env.OPENAI_API_KEY?.trim()) {
        return message.reply('OpenAI not configured. Set OPENAI_API_KEY in your environment or .env.').catch(() => {});
    }

    const fullUserContent = await buildUserContentForParrot(message, client.user);
    const messages = [
        { role: 'system', content: parrotConfig.systemPromptWithTools },
        { role: 'user', content: fullUserContent }
    ];

    // Reply immediately so the user sees something while tools/LLM run (AI SDK has no "before tool" callback).
    const placeholderText = 'juan second...';
    let replyMsg;
    try {
        replyMsg = await message.reply(placeholderText);
    } catch (e) {
        console.error('[Mention] Failed to send placeholder:', e?.message);
        return;
    }

    try {
        const { text, steps } = await chatWithTools(messages, { message, client }, {
            model: parrotConfig.model,
            maxTokens: Math.max(parrotConfig.max_completion_tokens ?? 150, 250)
        });
        const finalContent = text?.trim() || 'SQUAWK.';
        await replyMsg.edit(finalContent);

        const toolsCalled = getToolsCalledFromSteps(steps);
        await saveConversation({
            previous_message_id: message.id,
            reply_message_id: replyMsg.id,
            channel_id: message.channelId,
            guild_id: message.guildId ?? null,
            user_text: fullUserContent,
            response_text: finalContent,
            tools_called: toolsCalled,
        });
    } catch (err) {
        console.error('[Mention] OpenAI/tools error:', err.message || err, err.detail || '');
        const userMsg = getOpenAIErrorMessage(err);
        await replyMsg.edit(userMsg).catch(() => {});
    }
}

/**
 * Handles messageCreate: only runs onMention when the bot is @mentioned in an allowed channel.
 * Caller (discord-voting-bot.js) should fetch partial messages so content and mentions are available.
 */
async function handleMention(message, client) {
    if (message.author.bot) return;
    if (!message.mentions.users.has(client.user.id)) return;

    const ch = message.channel;
    const channelLabel = ch?.parent ? `#${ch.parent.name} (thread: ${ch.name})` : `#${ch?.name ?? 'dm'}`;
    if (!isChannelAllowed(ch)) {
        console.log(`[Mention] Skipped — bot was @mentioned in ${channelLabel} (channel not in allowlist).`);
        return;
    }

    try {
        await onMention(message, client);
    } catch (err) {
        console.error('Mention handler error:', err);
        await message.reply('Something went wrong.').catch(() => {});
    }
}

module.exports = {
    handleMention,
    onMention
};
