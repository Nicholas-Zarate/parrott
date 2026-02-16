/**
 * Rate limit for timer creation: max N creations per user per sliding window.
 * When over limit we do not record (blocked attempts don't extend the window).
 */

const { TIMER } = require('../../config/constants');

/** @type {Map<string, number[]>} userId -> timestamps of create_timer in current window */
const creationTimestamps = new Map();

const WINDOW_MS = TIMER.CREATION_WINDOW_MINUTES * 60 * 1000;
const MAX_CREATIONS = TIMER.CREATION_MAX_PER_WINDOW;

/**
 * Check if the user is within creation rate limit (does not record).
 * @param {string} userId - Discord user id (message.author.id)
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
function check(userId) {
    const now = Date.now();
    const timestamps = (creationTimestamps.get(userId) || []).filter((t) => now - t < WINDOW_MS);
    if (timestamps.length >= MAX_CREATIONS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true };
}

/**
 * Record one timer creation for rate limiting. Call only after a timer was successfully scheduled.
 * @param {string} userId - Discord user id
 */
function record(userId) {
    const now = Date.now();
    let timestamps = creationTimestamps.get(userId) || [];
    timestamps = timestamps.filter((t) => now - t < WINDOW_MS);
    timestamps.push(now);
    creationTimestamps.set(userId, timestamps);
}

module.exports = { check, record };
