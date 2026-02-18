/**
 * Timer service: schedule a callback to send a message in a channel (or DM) after a delay.
 * Used by create_timer tool. In-memory only; timers are lost on bot restart.
 */

const { TIMER } = require('../../config/constants');
const store = require('./store');
const { hasBlockedRole } = require('../restricted-roles');
const { getAllowActivityDm } = require('../../database/supabase/user-dm-preferences');

const LOG_PREFIX = '[Timer]';

function nextId() {
    return `timer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Send the timer message when it fires. Runs in setTimeout callback.
 * @param {import('discord.js').Client} client
 * @param {string} timerId
 */
async function fireTimer(client, timerId) {
    const entry = store.get(timerId);
    if (!entry) return;
    store.remove(timerId);

    const { userId, channelId, reminderMessage, replyInChannel } = entry;
    const mention = `<@${userId}>`;
    const body = reminderMessage?.trim()
        ? `Timer's up! ${reminderMessage}`
        : "Timer's up!";

    try {
        if (replyInChannel) {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel?.send) {
                await channel.send(`${mention} ${body}`);
                console.log(`${LOG_PREFIX} fired in channel ${channelId}`);
            } else {
                console.log(`${LOG_PREFIX} channel ${channelId} not found or not sendable`);
            }
        } else {
            const allowedByPreference = await getAllowActivityDm(userId);
            if (!allowedByPreference) {
                console.log(`${LOG_PREFIX} DM skipped — user ${userId} opted out of DMs.`);
                return;
            }
            const guildId = entry.guildId;
            if (guildId) {
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
                if (member && hasBlockedRole(member)) {
                    console.log(`${LOG_PREFIX} DM skipped — user ${userId} has a restricted role in guild.`);
                    return;
                }
            }
            const user = await client.users.fetch(userId).catch(() => null);
            if (user?.send) {
                await user.send(`${body}`);
                console.log(`${LOG_PREFIX} fired DM to ${userId}`);
            } else {
                console.log(`${LOG_PREFIX} user ${userId} not found or not DMable`);
            }
        }
    } catch (err) {
        console.error(`${LOG_PREFIX} send error:`, err?.message || err);
    }
}

/**
 * Schedule a timer. Rejects if user already has max active timers.
 * @param {import('discord.js').Client} client
 * @param {{ channelId: string, userId: string, guildId: string | null, reminderMessage: string, replyInChannel: boolean, durationMs: number }} opts
 * @returns {{ success: true, timerId: string } | { success: false, error: string }}
 */
function scheduleTimer(client, opts) {
    const { channelId, userId, guildId, reminderMessage, replyInChannel, durationMs } = opts;

    const activeCount = store.countActiveByUser(userId);
    if (activeCount >= TIMER.MAX_ACTIVE_PER_USER) {
        return {
            success: false,
            error: `You already have ${TIMER.MAX_ACTIVE_PER_USER} timers. Let some finish or wait for them to fire.`,
        };
    }

    const timerId = nextId();
    const timeoutId = setTimeout(() => fireTimer(client, timerId), durationMs);

    // Re-check under single-threaded event loop: another concurrent request may have just added.
    if (store.countActiveByUser(userId) >= TIMER.MAX_ACTIVE_PER_USER) {
        clearTimeout(timeoutId);
        return {
            success: false,
            error: `You already have ${TIMER.MAX_ACTIVE_PER_USER} timers. Let some finish or wait for them to fire.`,
        };
    }

    store.set(timerId, {
        userId,
        channelId,
        guildId: guildId ?? null,
        reminderMessage: reminderMessage || '',
        replyInChannel: replyInChannel !== false,
        timeoutId,
    });

    return { success: true, timerId };
}

module.exports = { scheduleTimer };
