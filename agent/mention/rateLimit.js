/**
 * Rate limit for @mentions: per user, per tier. Tier comes from channel config.
 * - unlimited: no limit (no storage)
 * - semi: 5 max in 2 minutes
 * - limited: 1 max in 5 minutes
 * When over limit we do not record the attempt (blocked attempts don't extend the window).
 */

const { TIER_UNLIMITED, TIER_SEMI, TIER_LIMITED } = require('./config');

/** @type {Map<string, number[]>} key = userId + '|' + tier -> timestamps in current window */
const mentionTimestamps = new Map();

const TIER_CONFIG = {
    [TIER_SEMI]: { windowMinutes: 2, maxMentions: 5 },
    [TIER_LIMITED]: { windowMinutes: 5, maxMentions: 1 },
};

/**
 * Check if the user is within rate limit for this tier and record this mention if allowed.
 * For unlimited tier, always allows and does not store.
 * When over limit, do not record (so blocked attempts don't add to the window).
 *
 * @param {string} userId - Discord user id (message.author.id)
 * @param {string} tier - 'unlimited' | 'semi' | 'limited'
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
function checkAndRecord(userId, tier) {
    if (tier === TIER_UNLIMITED) {
        return { allowed: true };
    }

    const config = TIER_CONFIG[tier] || TIER_CONFIG[TIER_SEMI];
    const WINDOW_MS = config.windowMinutes * 60 * 1000;
    const MAX_MENTIONS = config.maxMentions;
    const key = `${userId}|${tier}`;

    const now = Date.now();
    let timestamps = mentionTimestamps.get(key) || [];
    timestamps = timestamps.filter(t => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_MENTIONS) {
        const oldestInWindow = timestamps[0];
        const rawSeconds = (oldestInWindow + WINDOW_MS - now) / 1000;
        const retryAfterSeconds = Math.max(1, Math.ceil(rawSeconds));
        return { allowed: false, retryAfterSeconds };
    }

    timestamps.push(now);
    mentionTimestamps.set(key, timestamps);
    return { allowed: true };
}

module.exports = { checkAndRecord };
