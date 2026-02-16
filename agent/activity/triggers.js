/**
 * Activity trigger detection functions.
 *
 * Each trigger receives (oldPresence, newPresence, trackingState, triggerConfig)
 * and returns an array of trigger results (can be multiple, e.g. group_gaming
 * fires for multiple users). Each result is:
 *   { triggerType, userId, activityName?, activityType?, context }
 *
 * trackingState is a shared mutable object for cross-event data:
 *   - gameStartTimes: Map<"userId:gameName", number>  (when a game session started)
 *   - lastSeen: Map<userId, number>                   (last time user was online)
 */

const LOG_PREFIX = '[Activity triggers]';

/** Discord activity types. */
const ACTIVITY_PLAYING = 0;
const ACTIVITY_STREAMING = 1;

/**
 * Get the set of activity names of a given type from a presence.
 * @param {import('discord.js').Presence|null} presence
 * @param {number} type - Activity type to filter
 * @returns {Set<string>}
 */
function getActivityNames(presence, type) {
    const names = new Set();
    if (!presence?.activities) return names;
    for (const a of presence.activities) {
        if (a.type !== type) continue;
        const name = (a.name || '').trim();
        if (name) names.add(name);
    }
    return names;
}

/**
 * GAME_START: Fires when a Playing activity (type 0) appears that wasn't there before.
 */
function detectGameStart(oldPresence, newPresence, trackingState, _config) {
    const userId = newPresence.userId;
    const oldGames = getActivityNames(oldPresence, ACTIVITY_PLAYING);
    const newGames = getActivityNames(newPresence, ACTIVITY_PLAYING);

    const results = [];
    for (const game of newGames) {
        if (!oldGames.has(game)) {
            trackingState.gameStartTimes.set(`${userId}:${game}`, Date.now());
            console.log(`${LOG_PREFIX} [game_start] ${userId} started playing "${game}". Session tracked.`);
            results.push({
                triggerType: 'game_start',
                userId,
                activityName: game,
                activityType: ACTIVITY_PLAYING,
                context: { game },
            });
        }
    }

    // Clean up ended sessions
    for (const game of oldGames) {
        if (!newGames.has(game)) {
            trackingState.gameStartTimes.delete(`${userId}:${game}`);
            console.log(`${LOG_PREFIX} [game_start] ${userId} stopped playing "${game}". Session cleared.`);
        }
    }

    return results;
}

/**
 * LATE_NIGHT: Fires when a Playing activity is detected between startHour and endHour (UTC).
 * Only fires on new game starts (not ongoing sessions).
 */
function detectLateNight(oldPresence, newPresence, _trackingState, config) {
    const hour = new Date().getUTCHours();
    const startHour = config.startHour ?? 0;
    const endHour = config.endHour ?? 5;

    const inWindow = startHour <= endHour
        ? (hour >= startHour && hour < endHour)
        : (hour >= startHour || hour < endHour);

    if (!inWindow) return [];

    const userId = newPresence.userId;
    const oldGames = getActivityNames(oldPresence, ACTIVITY_PLAYING);
    const newGames = getActivityNames(newPresence, ACTIVITY_PLAYING);

    const results = [];
    for (const game of newGames) {
        if (!oldGames.has(game)) {
            console.log(`${LOG_PREFIX} [late_night] ${userId} started "${game}" at ${hour}:00 UTC (window: ${startHour}-${endHour}).`);
            results.push({
                triggerType: 'late_night',
                userId,
                activityName: game,
                activityType: ACTIVITY_PLAYING,
                context: { game, hour },
            });
        }
    }
    return results;
}

/**
 * LONG_SESSION: Fires when the same game has been active for thresholdMinutes+.
 * Checked on every presence update so we catch it even if the user's presence
 * changes for another reason (e.g. status change).
 */
function detectLongSession(_oldPresence, newPresence, trackingState, config) {
    const userId = newPresence.userId;
    const thresholdMs = (config.thresholdMinutes ?? 180) * 60 * 1000;
    const currentGames = getActivityNames(newPresence, ACTIVITY_PLAYING);
    const now = Date.now();

    const results = [];
    for (const game of currentGames) {
        const key = `${userId}:${game}`;
        const startTime = trackingState.gameStartTimes.get(key);
        if (startTime == null) {
            trackingState.gameStartTimes.set(key, now);
            console.log(`${LOG_PREFIX} [long_session] ${userId} already playing "${game}" — began tracking now.`);
            continue;
        }

        const elapsed = now - startTime;
        const elapsedMin = Math.round(elapsed / 60000);
        const thresholdMin = config.thresholdMinutes ?? 180;
        if (elapsed >= thresholdMs) {
            const hours = Math.round((elapsed / (60 * 60 * 1000)) * 10) / 10;
            console.log(`${LOG_PREFIX} [long_session] ${userId} playing "${game}" for ${hours}h (threshold: ${thresholdMin}min). Firing.`);
            results.push({
                triggerType: 'long_session',
                userId,
                activityName: game,
                activityType: ACTIVITY_PLAYING,
                context: { game, hoursPlayed: hours },
            });
            trackingState.gameStartTimes.set(key, now);
            console.log(`${LOG_PREFIX} [long_session] Timer reset for ${userId}:"${game}". Next fire in ~${thresholdMin}min.`);
        }
    }
    return results;
}

/**
 * GROUP_GAMING: Fires when minPlayers+ guild members are playing the same game.
 * Only fires when a new player joins a group (i.e., the triggering user just started the game).
 */
function detectGroupGaming(oldPresence, newPresence, _trackingState, config) {
    const userId = newPresence.userId;
    const guild = newPresence.guild;
    if (!guild?.members?.cache) return [];

    const minPlayers = config.minPlayers ?? 3;
    const oldGames = getActivityNames(oldPresence, ACTIVITY_PLAYING);
    const newGames = getActivityNames(newPresence, ACTIVITY_PLAYING);

    const results = [];
    for (const game of newGames) {
        if (oldGames.has(game)) continue;

        const players = [];
        for (const [memberId, member] of guild.members.cache) {
            if (member.user?.bot) continue;
            const memberGames = getActivityNames(member.presence, ACTIVITY_PLAYING);
            if (memberGames.has(game)) {
                players.push(memberId);
            }
        }

        console.log(`${LOG_PREFIX} [group_gaming] ${userId} started "${game}" — ${players.length} total player(s) in guild (min: ${minPlayers}).`);

        if (players.length >= minPlayers) {
            console.log(`${LOG_PREFIX} [group_gaming] Threshold met! ${players.length} playing "${game}": [${players.slice(0, 10).join(', ')}].`);
            results.push({
                triggerType: 'group_gaming',
                userId,
                activityName: game,
                activityType: ACTIVITY_PLAYING,
                context: {
                    game,
                    playerCount: players.length,
                    playerIds: players.slice(0, 10),
                },
            });
        }
    }
    return results;
}

/**
 * STREAMING: Fires when a Streaming activity (type 1) appears that wasn't there before.
 */
function detectStreaming(oldPresence, newPresence, _trackingState, _config) {
    const userId = newPresence.userId;
    const oldStreams = getActivityNames(oldPresence, ACTIVITY_STREAMING);
    const newStreams = getActivityNames(newPresence, ACTIVITY_STREAMING);

    const results = [];
    for (const stream of newStreams) {
        if (!oldStreams.has(stream)) {
            console.log(`${LOG_PREFIX} [streaming] ${userId} started streaming "${stream}".`);
            results.push({
                triggerType: 'streaming',
                userId,
                activityName: stream,
                activityType: ACTIVITY_STREAMING,
                context: { stream },
            });
        }
    }
    return results;
}

/**
 * COMEBACK: Fires when a user goes from offline/null to online/idle/dnd after being
 * away for absenceMinutes+. Uses lastSeen tracking map.
 */
function detectComeback(oldPresence, newPresence, trackingState, config) {
    const userId = newPresence.userId;
    const absenceMs = (config.absenceMinutes ?? 1440) * 60 * 1000;

    const oldStatus = oldPresence?.status ?? 'offline';
    const newStatus = newPresence.status;
    const onlineStatuses = new Set(['online', 'idle', 'dnd']);

    // User is still offline or was already online — nothing to do
    if (!onlineStatuses.has(newStatus)) {
        if (onlineStatuses.has(oldStatus)) {
            trackingState.lastSeen.set(userId, Date.now());
            console.log(`${LOG_PREFIX} [comeback] ${userId} went offline (${oldStatus} → ${newStatus}). Recorded lastSeen.`);
        }
        return [];
    }

    if (onlineStatuses.has(oldStatus)) {
        return [];
    }

    // User just came online from offline
    const lastSeenTime = trackingState.lastSeen.get(userId);
    trackingState.lastSeen.set(userId, Date.now());

    if (lastSeenTime == null) {
        console.log(`${LOG_PREFIX} [comeback] ${userId} came online — first time seen since bot start, no baseline. Skipping.`);
        return [];
    }

    const absence = Date.now() - lastSeenTime;
    const absenceHours = Math.round((absence / (60 * 60 * 1000)) * 10) / 10;
    const thresholdHours = Math.round((absenceMs / (60 * 60 * 1000)) * 10) / 10;

    if (absence >= absenceMs) {
        console.log(`${LOG_PREFIX} [comeback] ${userId} returned after ${absenceHours}h absence (threshold: ${thresholdHours}h). Firing.`);
        return [{
            triggerType: 'comeback',
            userId,
            activityName: null,
            activityType: null,
            context: { hoursAway: absenceHours },
        }];
    }

    console.log(`${LOG_PREFIX} [comeback] ${userId} returned after ${absenceHours}h — under ${thresholdHours}h threshold. No trigger.`);
    return [];
}

/** Map of trigger type name → detection function. */
const TRIGGER_DETECTORS = {
    game_start: detectGameStart,
    late_night: detectLateNight,
    long_session: detectLongSession,
    group_gaming: detectGroupGaming,
    streaming: detectStreaming,
    comeback: detectComeback,
};

/**
 * Run all enabled triggers against a presence update.
 *
 * @param {import('discord.js').Presence|null} oldPresence
 * @param {import('discord.js').Presence} newPresence
 * @param {object} trackingState - Shared mutable tracking data
 * @param {object} triggersConfig - From config/activity.js triggers
 * @returns {Array<{ triggerType, userId, activityName?, activityType?, context }>}
 */
function detectAll(oldPresence, newPresence, trackingState, triggersConfig) {
    const results = [];
    for (const [type, detector] of Object.entries(TRIGGER_DETECTORS)) {
        const cfg = triggersConfig[type];
        if (!cfg?.enabled) continue;
        try {
            const hits = detector(oldPresence, newPresence, trackingState, cfg);
            if (hits.length > 0) {
                console.log(`${LOG_PREFIX} ${type} fired for ${newPresence.userId}: ${hits.length} hit(s)`);
            }
            results.push(...hits);
        } catch (err) {
            console.error(`${LOG_PREFIX} Error in ${type} detector:`, err.message || err);
        }
    }
    return results;
}

module.exports = {
    detectAll,
    TRIGGER_DETECTORS,
    getActivityNames,
};
