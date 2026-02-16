/**
 * Activity-triggered message handlers (presence and voice).
 *
 * Flow: presenceUpdate → filter → detect triggers → cooldown → deliver
 *       voiceStateUpdate → detect Go Live → cooldown → deliver (same path)
 *
 * This module owns the shared tracking state and wires triggers, cooldown, and deliver.
 */

const activityConfig = require('../config/activity');
const { detectAll } = require('./triggers');
const cooldown = require('./cooldown');
const { deliver } = require('./deliver');
const { getResolvedSettings } = require('./settings-resolver');

const LOG_PREFIX = '[Activity listener]';

/**
 * Shared mutable tracking state, persists across events for the bot's lifetime.
 *   - gameStartTimes: Map<"userId:gameName", number>  (when a game session started)
 *   - lastSeen: Map<userId, number>                   (last time user was online)
 */
const trackingState = {
    gameStartTimes: new Map(),
    lastSeen: new Map(),
};

/** Prune tracking maps to keep memory bounded. */
const TRACKING_PRUNE_INTERVAL_MS = 30 * 60 * 1000;
const TRACKING_MAX_AGE_MS = 48 * 60 * 60 * 1000;
let trackingPruneInterval = null;

function pruneTrackingState() {
    const now = Date.now();
    let removed = 0;
    for (const [key, ts] of trackingState.gameStartTimes) {
        if (now - ts > TRACKING_MAX_AGE_MS) {
            trackingState.gameStartTimes.delete(key);
            removed++;
        }
    }
    for (const [key, ts] of trackingState.lastSeen) {
        if (now - ts > TRACKING_MAX_AGE_MS) {
            trackingState.lastSeen.delete(key);
            removed++;
        }
    }
    if (removed > 0) {
        console.log(`${LOG_PREFIX} Pruned ${removed} stale tracking entries.`);
    }
}

/**
 * Set of userId values currently being processed, to prevent concurrent
 * handling of rapid presence updates for the same user.
 */
const processingUsers = new Set();

/**
 * Process a single trigger: check config, cooldown, then deliver and record.
 * Shared by presence and voice (go_live) handlers. Uses resolved settings (DB or file).
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {{ triggerType: string, userId: string, activityName?: string, activityType?: number, context: object }} trigger
 * @param {string} displayName - For logging
 * @param {object} resolved - From getResolvedSettings(guild.id, trigger.triggerType): enabled, cooldownMinutes, deliverChannel, deliverDm, deliverVoice, etc.
 * @returns {Promise<boolean>} true if delivered, false if skipped (disabled or cooldown)
 */
async function processOneTrigger(client, guild, trigger, displayName, resolved) {
    if (!resolved?.enabled) return false;

    const { allowed, retryAfterMs } = cooldown.check(trigger.userId, trigger.triggerType, resolved.cooldownMinutes);
    if (!allowed) {
        const retryMin = retryAfterMs ? Math.ceil(retryAfterMs / 60000) : '?';
        console.log(`${LOG_PREFIX} Cooldown BLOCKED ${trigger.triggerType} for ${displayName} — retry in ~${retryMin}min.`);
        return false;
    }
    console.log(`${LOG_PREFIX} Cooldown PASSED for ${trigger.triggerType}/${displayName} (cooldown: ${resolved.cooldownMinutes}min).`);

    console.log(`${LOG_PREFIX} >>> Delivering ${trigger.triggerType} for ${displayName} (activity: ${trigger.activityName || 'N/A'})...`);
    try {
        await deliver(client, guild, trigger, resolved);
        cooldown.record(trigger.userId, trigger.triggerType);
        console.log(`${LOG_PREFIX} <<< Delivered ${trigger.triggerType} for ${displayName}. Cooldown recorded.`);
        return true;
    } catch (err) {
        console.error(`${LOG_PREFIX} <<< Delivery FAILED for ${trigger.triggerType}/${displayName}:`, err.message || err);
        return false;
    }
}

/**
 * Handle a presenceUpdate event. Called from discord-voting-bot.js.
 *
 * @param {import('discord.js').Presence|null} oldPresence
 * @param {import('discord.js').Presence} newPresence
 * @param {import('discord.js').Client} client
 */
async function handlePresenceUpdate(oldPresence, newPresence, client) {
    // Filter: ignore bots
    if (newPresence.user?.bot) return;

    // Filter: must be in a guild
    const guild = newPresence.guild;
    if (!guild) return;

    const userId = newPresence.userId;
    const displayName = newPresence.member?.displayName ?? newPresence.user?.username ?? userId;
    const oldStatus = oldPresence?.status ?? 'offline';
    const newStatus = newPresence.status ?? 'unknown';
    const oldActivities = (oldPresence?.activities || []).map((a) => a.name).join(', ') || 'none';
    const newActivities = (newPresence.activities || []).map((a) => a.name).join(', ') || 'none';

    console.log(`${LOG_PREFIX} presenceUpdate for ${displayName} (${userId}) in ${guild.name}: status ${oldStatus} → ${newStatus} | activities [${oldActivities}] → [${newActivities}]`);

    // Prevent concurrent processing for the same user (rapid presence changes)
    if (processingUsers.has(userId)) {
        console.log(`${LOG_PREFIX} Skipping ${displayName} — already processing a trigger for this user.`);
        return;
    }

    // Detect all enabled triggers
    let triggers = detectAll(oldPresence, newPresence, trackingState, activityConfig.triggers);
    if (triggers.length === 0) {
        console.log(`${LOG_PREFIX} No triggers fired for ${displayName}.`);
        return;
    }

    console.log(`${LOG_PREFIX} Raw triggers for ${displayName}: ${triggers.map((t) => `${t.triggerType}(${t.activityName || '-'})`).join(', ')}`);

    // Deduplicate: late_night supersedes game_start for the same user+game
    const lateNightGames = new Set(
        triggers
            .filter((t) => t.triggerType === 'late_night')
            .map((t) => `${t.userId}:${t.activityName}`)
    );
    if (lateNightGames.size > 0) {
        const beforeCount = triggers.length;
        triggers = triggers.filter(
            (t) => t.triggerType !== 'game_start' || !lateNightGames.has(`${t.userId}:${t.activityName}`)
        );
        if (triggers.length < beforeCount) {
            console.log(`${LOG_PREFIX} Deduped: removed ${beforeCount - triggers.length} game_start trigger(s) superseded by late_night for ${displayName}.`);
        }
    }

    console.log(`${LOG_PREFIX} Processing ${triggers.length} trigger(s) for ${displayName}: ${triggers.map((t) => t.triggerType).join(', ')}`);

    processingUsers.add(userId);
    try {
        for (const trigger of triggers) {
            const resolved = await getResolvedSettings(guild.id, trigger.triggerType);
            await processOneTrigger(client, guild, trigger, displayName, resolved);
        }
    } finally {
        processingUsers.delete(userId);
        console.log(`${LOG_PREFIX} Finished processing for ${displayName}. Released lock.`);
    }
}

/**
 * Handle voiceStateUpdate: fire go_live trigger when a user starts Go Live (screen share) in VC.
 * Called from discord-voting-bot.js. Uses same cooldown/deliver path as presence triggers.
 *
 * @param {import('discord.js').VoiceState|null} oldState
 * @param {import('discord.js').VoiceState} newState
 * @param {import('discord.js').Client} client
 */
async function handleVoiceStateUpdate(oldState, newState, client) {
    if (newState.member?.user?.bot) return;
    const guild = newState.guild;
    if (!guild || !newState.channel) return;

    // Only fire when user just started streaming (Go Live), not when they stopped or were already streaming
    if (newState.streaming !== true || oldState?.streaming === true) return;

    const userId = newState.id;
    const displayName = newState.member?.displayName ?? newState.member?.user?.username ?? userId;
    const channelName = newState.channel?.name ?? 'voice';

    console.log(`${LOG_PREFIX} go_live: ${displayName} (${userId}) started Go Live in #${channelName}.`);

    if (processingUsers.has(userId)) {
        console.log(`${LOG_PREFIX} Skipping ${displayName} — already processing a trigger for this user.`);
        return;
    }

    const trigger = {
        triggerType: 'go_live',
        userId,
        activityName: channelName,
        activityType: null,
        context: { channelName },
    };

    const resolved = await getResolvedSettings(guild.id, 'go_live');
    processingUsers.add(userId);
    try {
        await processOneTrigger(client, guild, trigger, displayName, resolved);
    } finally {
        processingUsers.delete(userId);
        console.log(`${LOG_PREFIX} Finished processing go_live for ${displayName}. Released lock.`);
    }
}

/**
 * Initialize the activity listener system. Call once on bot ready.
 * Starts cooldown cleanup and tracking state pruning.
 */
function init() {
    cooldown.startCleanup();
    if (!trackingPruneInterval) {
        trackingPruneInterval = setInterval(pruneTrackingState, TRACKING_PRUNE_INTERVAL_MS);
        trackingPruneInterval.unref?.();
    }
    console.log(`${LOG_PREFIX} Initialized. Enabled triggers: ${
        Object.entries(activityConfig.triggers)
            .filter(([, cfg]) => cfg.enabled)
            .map(([type]) => type)
            .join(', ')
    }`);
}

/**
 * Shutdown cleanup (for tests or graceful shutdown).
 */
function shutdown() {
    cooldown.stopCleanup();
    if (trackingPruneInterval) {
        clearInterval(trackingPruneInterval);
        trackingPruneInterval = null;
    }
    processingUsers.clear();
}

module.exports = {
    handlePresenceUpdate,
    handleVoiceStateUpdate,
    init,
    shutdown,
    trackingState,
};
