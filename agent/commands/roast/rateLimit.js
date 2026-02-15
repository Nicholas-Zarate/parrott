const roastConfig = require('../../config/roast');

/** @type {Map<string, number[]>} userId -> timestamps of /roast uses in current window */
const useTimestamps = new Map();

const WINDOW_MS = (roastConfig.rateLimit?.windowMinutes ?? 5) * 60 * 1000;
const MAX_USES = roastConfig.rateLimit?.maxUses ?? 3;

/**
 * Check if the user is within rate limit and record this use if allowed.
 * @param {string} userId - Command invoker's Discord user id
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
function checkAndRecord(userId) {
    const now = Date.now();
    let timestamps = useTimestamps.get(userId) || [];
    timestamps = timestamps.filter(t => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_USES) {
        const oldestInWindow = timestamps[0];
        const retryAfterSeconds = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
        return { allowed: false, retryAfterSeconds };
    }

    timestamps.push(now);
    useTimestamps.set(userId, timestamps);
    return { allowed: true };
}

module.exports = { checkAndRecord };
