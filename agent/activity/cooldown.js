/**
 * Per-user per-trigger cooldown manager for activity listeners.
 * Uses in-memory Maps with periodic cleanup of expired entries.
 *
 * Key format: "userId:triggerType" → timestamp of last allowed trigger.
 */

const LOG_PREFIX = '[Activity cooldown]';

/** Map<"userId:triggerType", number> — timestamp (ms) of the last allowed fire. */
const cooldowns = new Map();

/** Interval handle for periodic cleanup. */
let cleanupInterval = null;

/** Default cleanup interval: 30 minutes. */
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Check whether a trigger is allowed for this user right now.
 * Does NOT record — call record() after successful delivery.
 *
 * @param {string} userId
 * @param {string} triggerType
 * @param {number} cooldownMinutes - Cooldown duration from config
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 */
function check(userId, triggerType, cooldownMinutes) {
    const key = `${userId}:${triggerType}`;
    const last = cooldowns.get(key);
    if (last == null) {
        console.log(`${LOG_PREFIX} check ${key}: no prior record → ALLOWED.`);
        return { allowed: true };
    }

    const cooldownMs = cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - last;
    const elapsedMin = Math.round(elapsed / 60000);

    if (elapsed < cooldownMs) {
        const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
        console.log(`${LOG_PREFIX} check ${key}: last fired ${elapsedMin}min ago, cooldown ${cooldownMinutes}min → BLOCKED (${remainingMin}min remaining).`);
        return { allowed: false, retryAfterMs: cooldownMs - elapsed };
    }
    console.log(`${LOG_PREFIX} check ${key}: last fired ${elapsedMin}min ago, cooldown ${cooldownMinutes}min → ALLOWED (expired).`);
    return { allowed: true };
}

/**
 * Record that a trigger just fired for this user.
 * Call after successful delivery so failed deliveries don't consume the cooldown.
 *
 * @param {string} userId
 * @param {string} triggerType
 */
function record(userId, triggerType) {
    const key = `${userId}:${triggerType}`;
    cooldowns.set(key, Date.now());
    console.log(`${LOG_PREFIX} record ${key}: cooldown started at ${new Date().toISOString()}.`);
}

/**
 * Prune entries older than maxAgeMs (default: 24 hours).
 * Called periodically to keep memory bounded.
 */
function prune(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let removed = 0;
    for (const [key, ts] of cooldowns) {
        if (now - ts > maxAgeMs) {
            cooldowns.delete(key);
            removed++;
        }
    }
    if (removed > 0) {
        console.log(`${LOG_PREFIX} Pruned ${removed} stale cooldown entries.`);
    }
}

/**
 * Start periodic cleanup. Safe to call multiple times (idempotent).
 */
function startCleanup() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => prune(), CLEANUP_INTERVAL_MS);
    cleanupInterval.unref?.();
}

/**
 * Stop periodic cleanup (for tests or shutdown).
 */
function stopCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

/**
 * Clear all cooldowns (for tests).
 */
function clear() {
    cooldowns.clear();
}

module.exports = {
    check,
    record,
    prune,
    startCleanup,
    stopCleanup,
    clear,
};
