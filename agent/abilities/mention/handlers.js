const { isChannelAllowed, getChannelTier } = require('./config');
const { buildUserContentForParrot, getPreviousTurnForParrot, isBotMentionedInContent } = require('./format');
const { checkAndRecord, getRetryAfterSeconds, plural } = require('./rateLimit');
const { hasBlockedRole } = require('../restricted-roles');
const parrotConfig = require('../../config/parrot');
const { getOpenAIErrorMessage } = require('../../commands/roast/openai');
const { chatWithTools } = require('../../ai-sdk/with-tools');
const { saveConversation, getToolsCalledFromSteps } = require('../../supabase/conversation-history');
const { playInVoiceChannel } = require('../voice');

/** Max length of reply text sent to TTS when user asks for "in voice" / "in VC". */
const VOICE_REPLY_MAX_LEN = 200;

/**
 * Runs when someone mentions the bot in an allowed channel.
 * Rate limited per user and per channel tier (unlimited / semi: 5 per 2 min / limited: 1 per 5 min); when over limit replies with resting message and returns.
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

    // Blocked Discord roles (e.g. Wanderer): polite rejection, no LLM/tools
    if (message.guild) {
        const member = message.member ?? await message.guild.members.fetch(message.author?.id).catch(() => null);
        if (member && hasBlockedRole(member)) {
            const reply = "only full members can use the parrot here, no cap.";
            await message.reply(reply).catch(() => null);
            return;
        }
    }

    const tier = getChannelTier(message.channel);
    const userId = message.author?.id;
    if (userId) {
        const { allowed, retryAfterSeconds } = checkAndRecord(userId, tier);
        if (!allowed) {
            const restingMsg = `juan second fam, i'm resting (wait ${plural(retryAfterSeconds)} ninja)`;
            console.log(`[Mention] Rate limited ${userId} (tier=${tier}), retry in ${retryAfterSeconds}s`);
            const replyMsg = await message.reply(restingMsg).catch(() => null);
            if (replyMsg) {
                const intervalMs = 15 * 1000;
                const intervalId = setInterval(async () => {
                    const secondsLeft = getRetryAfterSeconds(userId, tier);
                    if (secondsLeft <= 0) {
                        clearInterval(intervalId);
                        await replyMsg.edit("juan second fam, you can try again now.").catch(() => {});
                        return;
                    }
                    await replyMsg.edit(`juan second fam, i'm resting (wait ${plural(secondsLeft)} ninja)`).catch(() => {});
                }, intervalMs);
            }
            return;
        }
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
        return message.reply('OpenAI not configured. Set OPENAI_API_KEY in your environment or .env.').catch(() => {});
    }

    const fullUserContent = await buildUserContentForParrot(message, client.user);
    const previousTurn = await getPreviousTurnForParrot(message, client.user);
    // VC tone (2/3 words) disabled; always use text tone. Re-enable by passing inVoiceContext from member.voice.channel (see PLAN_VC_TOOL_HOLLA_SAY.md).
    const systemPrompt = parrotConfig.getSystemPromptWithTools({});
    if (!parrotConfig.getTones() || !systemPrompt?.trim()) {
        await message.reply("Personality isn't configured yet; check the Personality page and Supabase.").catch(() => null);
        return;
    }
    if (!parrotConfig.getTones()?.text) {
        await message.reply("Text media is disabled. Enable it on the Personality page to use the parrot.").catch(() => null);
        return;
    }
    const messages = [
        { role: 'system', content: systemPrompt },
        ...(previousTurn
            ? [
                { role: 'user', content: previousTurn.userContent },
                { role: 'assistant', content: previousTurn.assistantContent },
                { role: 'user', content: fullUserContent },
            ]
            : [{ role: 'user', content: fullUserContent }]
        ),
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
            maxTokens: Math.max(parrotConfig.max_completion_tokens ?? 256, 400),
        });
        const finalContent = text?.trim() || 'SQUAWK.';
        await replyMsg.edit(finalContent);

        const wantsVoice = /\b(in voice chat|in voice|in vc)\b/i.test(fullUserContent || message.content || '');
        if (wantsVoice && message.guild) {
            const member = message.member ?? await message.guild.members.fetch(message.author?.id).catch(() => null);
            const voiceChannel = member?.voice?.channel;
            if (voiceChannel) {
                const textToSpeak = finalContent.length > VOICE_REPLY_MAX_LEN
                    ? finalContent.slice(0, VOICE_REPLY_MAX_LEN).trim() + '…'
                    : finalContent;
                playInVoiceChannel(client, voiceChannel, { type: 'tts', text: textToSpeak }).catch((err) => {
                    console.error('[Mention] Voice delivery failed:', err?.message || err);
                });
            }
        }

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
 * True if the message @mentions a role that the bot has in this guild (e.g. <@&roleId>).
 * Used when people @mention a role like "Parrott" instead of the bot user directly.
 *
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>}
 */
async function isBotMentionedByRole(message, client) {
    if (!message.guild || !client.user?.id) return false;
    const roles = message.mentions?.roles;
    if (!roles || roles.size === 0) return false;
    const member = message.guild.members.cache.get(client.user.id) ?? await message.guild.members.fetch(client.user.id).catch(() => null);
    if (!member?.roles?.cache) return false;
    for (const [roleId] of roles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

/**
 * Handles messageCreate: only runs onMention when the bot is @mentioned in an allowed channel.
 * Bot can be mentioned by: (1) user mention in content or mentions.users, (2) role mention (any role the bot has).
 */
async function handleMention(message, client) {
    if (message.author.bot) return;
    const byUser = isBotMentionedInContent(message.content, client.user?.id) || message.mentions.users.has(client.user?.id);
    const byRole = await isBotMentionedByRole(message, client);
    const botMentioned = byUser || byRole;
    if (!botMentioned) return;

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
    onMention,
    isBotMentionedByRole
};
