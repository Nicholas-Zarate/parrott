/**
 * Delivery layer for activity-triggered messages.
 * Generates an AI message using the parrot personality, then delivers via:
 *   1. Dedicated text channel (#parrot-activity or configured name)
 *   2. DM to the user
 *   3. Voice TTS (if user is in a voice channel)
 *   4. Supabase logging
 */

const { generateText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const parrotConfig = require('../config/parrot');
const activityConfig = require('../config/activity');
const { playInVoiceChannel } = require('../abilities/voice');
const { logActivityEvent } = require('../supabase/activity-listeners');

const LOG_PREFIX = '[Activity deliver]';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

/** System prompt templates per trigger type, giving the AI context for a short reaction. */
const TRIGGER_PROMPTS = {
    game_start: (ctx) =>
        `A user just started playing "${ctx.game}". Write a very short casual reaction (6-9 words max) to them starting this game. Be friendly and laid back.`,
    late_night: (ctx) =>
        `A user just started playing "${ctx.game}" and it's ${ctx.hour ?? 'late'} o'clock at night. Write a very short casual reaction (6-9 words max) teasing them for gaming so late. Be warm, not mean.`,
    long_session: (ctx) =>
        `A user has been playing "${ctx.game}" for about ${ctx.hoursPlayed} hours straight. Write a very short casual reaction (6-9 words max) about their long gaming session. Be friendly.`,
    group_gaming: (ctx) =>
        `${ctx.playerCount} users are now all playing "${ctx.game}" together. Write a very short casual reaction (6-9 words max) about the group gaming session. Be hyped but chill.`,
    streaming: (ctx) =>
        `A user just went live streaming "${ctx.stream}". Write a very short casual reaction (6-9 words max) about them streaming. Be supportive and laid back.`,
    go_live: (ctx) =>
        `A user just went live (screen share) in voice channel "${ctx?.channelName || 'voice'}". Write a very short casual reaction (6-9 words max) about them going live. Be supportive and laid back.`,
    comeback: (ctx) =>
        `A user just came back online after being away for about ${ctx.hoursAway} hours. Write a very short casual greeting (6-9 words max) welcoming them back. Be warm and friendly.`,
};

/**
 * Generate a short AI message for the given trigger.
 * @param {string} triggerType
 * @param {object} context - Trigger-specific context (game, hoursPlayed, etc.)
 * @returns {Promise<string>}
 */
async function generateMessage(triggerType, context) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} No OPENAI_API_KEY, using fallback message.`);
        return getFallbackMessage(triggerType, context);
    }

    const promptFn = TRIGGER_PROMPTS[triggerType];
    if (!promptFn) {
        console.log(`${LOG_PREFIX} No prompt template for "${triggerType}", using fallback.`);
        return getFallbackMessage(triggerType, context);
    }

    const modelId = parrotConfig.model || DEFAULT_MODEL;
    const sections = parrotConfig.getSystemPromptSections();
    const systemPrompt = [sections.role, sections.voice, sections.constraints].filter(Boolean).join(' ');
    const userPrompt = promptFn(context);

    console.log(`${LOG_PREFIX} Generating AI message for ${triggerType} via model "${modelId}"...`);
    console.log(`${LOG_PREFIX} User prompt: "${userPrompt}"`);

    try {
        const model = openai(modelId);
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            maxTokens: 60,
        });
        const text = result.text?.trim();
        if (text) {
            console.log(`${LOG_PREFIX} AI response: "${text}"`);
            return text;
        }
        console.log(`${LOG_PREFIX} AI returned empty response, falling back.`);
    } catch (err) {
        console.error(`${LOG_PREFIX} AI generation failed:`, err.message || err);
    }

    const fallback = getFallbackMessage(triggerType, context);
    console.log(`${LOG_PREFIX} Using fallback message: "${fallback}"`);
    return fallback;
}

/**
 * Static fallback messages when AI is unavailable.
 */
function getFallbackMessage(triggerType, context) {
    switch (triggerType) {
        case 'game_start': return `oh you on ${context.game} huh`;
        case 'late_night': return `go to sleep bro`;
        case 'long_session': return `you been on ${context.game} for a minute`;
        case 'group_gaming': return `y'all really in ${context.game} deep`;
        case 'streaming': return `oh we live huh`;
        case 'go_live': return `someone's going live in ${context?.channelName || 'voice'}`;
        case 'comeback': return `look who showed up`;
        default: return 'SQUAWK.';
    }
}

/**
 * Find the dedicated activity channel in the guild.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').TextChannel|null}
 */
function findActivityChannel(guild) {
    const name = activityConfig.channelName;
    if (!name || !guild?.channels?.cache) return null;
    return guild.channels.cache.find(
        (c) => c.isTextBased() && c.type !== 4 && c.name === name
    ) ?? null;
}

/**
 * Deliver a triggered activity message to all configured destinations.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {{ triggerType: string, userId: string, activityName?: string, activityType?: number, context: object }} trigger
 * @returns {Promise<void>}
 */
async function deliver(client, guild, trigger) {
    const { triggerType, userId, activityName, activityType, context } = trigger;

    // Generate the AI message
    const message = await generateMessage(triggerType, context);
    console.log(`${LOG_PREFIX} Generated message for ${triggerType}/${userId}: "${message}"`);

    const deliveredTo = [];
    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    const displayName = member?.displayName ?? member?.user?.username ?? 'someone';
    const mention = `<@${userId}>`;

    // 1. Send to dedicated channel
    const channel = findActivityChannel(guild);
    if (channel) {
        try {
            await channel.send(`${mention} ${message}`);
            deliveredTo.push('channel');
            console.log(`${LOG_PREFIX} Sent to #${channel.name}`);
        } catch (err) {
            console.error(`${LOG_PREFIX} Failed to send to #${channel.name}:`, err.message);
        }
    } else {
        console.log(`${LOG_PREFIX} No channel "${activityConfig.channelName}" found in guild ${guild.name}. Skipping channel delivery.`);
    }

    // 2. DM the user
    if (activityConfig.dmUser) {
        if (member?.user) {
            try {
                await member.user.send(message);
                deliveredTo.push('dm');
                console.log(`${LOG_PREFIX} DM sent to ${displayName}.`);
            } catch (err) {
                console.log(`${LOG_PREFIX} Could not DM ${displayName}: ${err.message} (user may have DMs disabled).`);
            }
        } else {
            console.log(`${LOG_PREFIX} DM skipped — could not resolve member/user for ${userId}.`);
        }
    } else {
        console.log(`${LOG_PREFIX} DM delivery disabled in config.`);
    }

    // 3. Voice TTS (only if user is currently in a voice channel)
    if (activityConfig.voiceIfConnected && member?.voice?.channel) {
        const voiceChannel = member.voice.channel;
        try {
            console.log(`${LOG_PREFIX} Joining VC "${voiceChannel.name}" for TTS`);
            const result = await playInVoiceChannel(client, voiceChannel, {
                type: 'tts',
                text: message,
            });
            if (result.success) {
                deliveredTo.push('voice');
                console.log(`${LOG_PREFIX} Voice TTS delivered in "${voiceChannel.name}"`);
            } else {
                console.log(`${LOG_PREFIX} Voice TTS failed: ${result.error}`);
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} Voice TTS error:`, err.message || err);
        }
    }

    // 3b. Voice skipped reasons
    if (!activityConfig.voiceIfConnected) {
        console.log(`${LOG_PREFIX} Voice TTS delivery disabled in config.`);
    } else if (!member?.voice?.channel) {
        console.log(`${LOG_PREFIX} Voice TTS skipped — ${displayName} is not in a voice channel.`);
    }

    // 4. Log to Supabase (user_id + user_name so we know who triggered the activity)
    console.log(`${LOG_PREFIX} Logging event to Supabase (trigger: ${triggerType}, user: ${userId}, delivered: [${deliveredTo.join(', ')}])...`);
    const dbResult = await logActivityEvent({
        guild_id: guild.id,
        user_id: userId,
        user_name: displayName,
        trigger_type: triggerType,
        activity_name: activityName ?? null,
        activity_type: activityType ?? null,
        context,
        message,
        delivered_to: deliveredTo,
    });
    if (dbResult.ok) {
        console.log(`${LOG_PREFIX} Supabase log saved successfully.`);
    } else {
        console.log(`${LOG_PREFIX} Supabase log failed: ${dbResult.error || 'unknown error'}`);
    }

    console.log(`${LOG_PREFIX} Delivery complete for ${triggerType}/${displayName}: [${deliveredTo.join(', ')}]`);
}

module.exports = {
    deliver,
    generateMessage,
    findActivityChannel,
};
