/**
 * create_timer tool: schedule a timer/reminder (including Popeyes timer).
 */

const { tool } = require('ai');
const z = require('zod');
const { TIMER } = require('../config/constants');
const { scheduleTimer } = require('../abilities/timer');
const { check: checkTimerCreationLimit, record: recordTimerCreation } = require('../abilities/timer/rateLimit');
const { getToolDescription, LOG_PREFIX } = require('./helpers/helpers');

function buildCreateTimerTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('create_timer'),
        parameters: z.object({
            durationMinutes: z.number().min(0).max(1440).describe('Duration in minutes (1 to 1440). Pass 0 if user did not say how long (you will ask) or if isPopeyesTimer is true.'),
            isPopeyesTimer: z.boolean().describe('True when the user says it\'s a Popeyes timer (or says yes when you ask). Uses 10m + random 2–15m.'),
            reminderMessage: z.string().describe('Optional reminder text to show when the timer fires; pass empty string if none.'),
            replyInChannel: z.boolean().describe('True to post in the same channel when timer fires; false to DM the user. Default true.'),
        }),
        execute: async ({ durationMinutes, isPopeyesTimer = false, reminderMessage, replyInChannel = true }) => {
            const channelName = message?.channel?.name ?? 'dm';
            const authorTag = message?.author?.tag ?? 'unknown';
            console.log(`${LOG_PREFIX} create_timer requested by @${authorTag} in #${channelName}: popeyes=${isPopeyesTimer} duration=${durationMinutes ?? 'none'}`);

            if (!message || !client) {
                console.log(`${LOG_PREFIX} create_timer failed: missing Discord context`);
                return { success: false, error: 'Missing Discord context. This must be used when someone @mentions the bot in a channel.' };
            }

            const userId = message.author?.id;
            const channelId = message.channelId;
            const guildId = message.guildId ?? null;

            if (!userId || !channelId) {
                return { success: false, error: 'Could not determine user or channel.' };
            }

            let durationMin;
            if (isPopeyesTimer) {
                const base = TIMER.POPEYES_BASE_MINUTES;
                const lo = TIMER.POPEYES_RANDOM_MIN_MINUTES;
                const hi = TIMER.POPEYES_RANDOM_MAX_MINUTES;
                durationMin = base + lo + Math.floor(Math.random() * (hi - lo + 1));
            } else if (durationMinutes == null || durationMinutes === 0 || (typeof durationMinutes === 'number' && !Number.isFinite(durationMinutes))) {
                return {
                    success: false,
                    error: "Need to know how long—how many minutes?",
                    hint: 'Ask the user how long they want the timer for (e.g. "How long?", "5 minutes?", "1 hour?").',
                };
            } else {
                durationMin = Math.max(TIMER.MIN_DURATION_MINUTES, Math.min(TIMER.MAX_DURATION_MINUTES, durationMinutes));
            }

            const rawReminder = typeof reminderMessage === 'string' ? reminderMessage.trim() : '';
            const reminderFinal = rawReminder.length > TIMER.MAX_REMINDER_LENGTH
                ? rawReminder.slice(0, TIMER.MAX_REMINDER_LENGTH) + '…'
                : rawReminder;

            const { allowed, retryAfterSeconds } = checkTimerCreationLimit(userId);
            if (!allowed) {
                return {
                    success: false,
                    error: `Too many timers created lately. Try again in ${retryAfterSeconds} seconds.`,
                    hint: 'Tell the user to wait a bit before setting another timer.',
                };
            }

            const durationMs = durationMin * 60 * 1000;
            const result = scheduleTimer(client, {
                channelId,
                userId,
                guildId,
                reminderMessage: reminderFinal,
                replyInChannel: Boolean(replyInChannel),
                durationMs,
            });

            if (!result.success) {
                return { success: false, error: result.error };
            }

            recordTimerCreation(userId);

            const label = durationMin === 1 ? '1 minute' : durationMin < 60 ? `${durationMin} minutes` : durationMin === 60 ? '1 hour' : `${Math.round(durationMin / 60)} hours`;
            console.log(`${LOG_PREFIX} create_timer success for @${authorTag} in ${label}${isPopeyesTimer ? ' (Popeyes)' : ''}`);
            const prefix = isPopeyesTimer ? 'Popeyes timer set for ' : 'Timer set for ';
            return {
                success: true,
                durationMinutes: durationMin,
                isPopeyesTimer,
                message: `${prefix}${label}. I'll hit you back then.${reminderFinal ? ` Reminder: ${reminderFinal}` : ''}`,
            };
        },
    });
}

module.exports = { buildCreateTimerTool };
