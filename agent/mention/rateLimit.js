/**
 * Rate limit for @mentions: max N mentions per user per sliding window.
 * When over limit we do not record the attempt (blocked attempts don't extend the window).
 */

const parrotConfig = require('../config/parrot');

/** @type {Map<string, number[]>} userId -> timestamps of mentions in current window */
const mentionTimestamps = new Map();

const WINDOW_MS = (parrotConfig.mentionRateLimit?.windowMinutes ?? 2) * 60 * 1000;
const MAX_MENTIONS = parrotConfig.mentionRateLimit?.maxMentions ?? 5;

/**
 * Check if the user is within rate limit and record this mention if allowed.
 * When over limit, do not record (so blocked attempts don't add to the window).
 *
 * @param {string} userId - Discord user id (message.author.id)
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
function checkAndRecord(userId) {
    const now = Date.now();
    let timestamps = mentionTimestamps.get(userId) || [];
    timestamps = timestamps.filter(t => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_MENTIONS) {
        const oldestInWindow = timestamps[0];
        const rawSeconds = (oldestInWindow + WINDOW_MS - now) / 1000;
        const retryAfterSeconds = Math.max(1, Math.ceil(rawSeconds));
        return { allowed: false, retryAfterSeconds };
    }

    timestamps.push(now);
    mentionTimestamps.set(userId, timestamps);
    return { allowed: true };
}

module.exports = { checkAndRecord };
