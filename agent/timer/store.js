/**
 * In-memory store of pending timers. Keyed by timer id; used to count active timers per user and to clear on fire.
 */

/** @type {Map<string, { userId: string, channelId: string, guildId: string | null, reminderMessage: string, replyInChannel: boolean, timeoutId: ReturnType<typeof setTimeout> }>} */
const pending = new Map();

function get(timerId) {
    return pending.get(timerId);
}

function set(timerId, data) {
    pending.set(timerId, data);
}

function remove(timerId) {
    const entry = pending.get(timerId);
    if (entry && entry.timeoutId) {
        clearTimeout(entry.timeoutId);
    }
    pending.delete(timerId);
}

/**
 * Number of active timers for this user.
 * @param {string} userId
 * @returns {number}
 */
function countActiveByUser(userId) {
    let count = 0;
    for (const entry of pending.values()) {
        if (entry.userId === userId) count += 1;
    }
    return count;
}

module.exports = { get, set, remove, countActiveByUser };
