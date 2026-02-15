const { isChannelAllowed } = require('./config');
const { formatMessageForParrot } = require('./format');
const parrotConfig = require('../config/parrot');
const { requestChat, getOpenAIErrorMessage } = require('../commands/roast/openai');

/**
 * Runs when someone mentions the bot in an allowed channel.
 * Formats the message as context, calls OpenAI with the parrot personality, and replies.
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

    const userContext = formatMessageForParrot(message, client.user);
    const messages = [
        { role: 'system', content: parrotConfig.systemPrompt },
        { role: 'user', content: userContext }
    ];

    try {
        const { content } = await requestChat(messages, {
            model: parrotConfig.model,
            max_completion_tokens: parrotConfig.max_completion_tokens,
            max_tokens: parrotConfig.max_tokens
        });
        await message.reply(content || 'SQUAWK.');
    } catch (err) {
        console.error('Mention OpenAI error:', err.message || err, err.detail || '');
        const userMsg = getOpenAIErrorMessage(err);
        await message.reply(userMsg).catch(() => {});
    }
}

/**
 * Handles messageCreate: only runs onMention when the bot is @mentioned in an allowed channel.
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
