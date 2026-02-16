/**
 * Activity listener: verify the main handler wires triggers, cooldowns, and deduplication correctly.
 * Uses mocks for deliver() to avoid AI/Discord calls.
 * Run from agent/: node test/activity-listener.test.js
 */
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL: ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL: ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

console.log('Activity listener tests:');

// --- Test deduplication: late_night supersedes game_start ---
// We test the detectAll + deduplication logic directly since handlePresenceUpdate
// has async deliver calls that are hard to mock without a framework.

const { detectAll } = require('../activity/triggers');
const cooldown = require('../activity/cooldown');

function mockPresence(userId, opts = {}) {
    const activities = (opts.activities || []).map((a) => ({
        type: a.type ?? 0,
        name: a.name ?? '',
        state: a.state ?? null,
    }));
    return {
        userId,
        user: { bot: opts.bot ?? false },
        status: opts.status ?? 'online',
        activities,
        guild: opts.guild ?? { members: { cache: new Map() } },
    };
}

function freshState() {
    return { gameStartTimes: new Map(), lastSeen: new Map() };
}

// Simulate the deduplication logic from listener.js
function deduplicateTriggers(triggers) {
    const lateNightGames = new Set(
        triggers
            .filter((t) => t.triggerType === 'late_night')
            .map((t) => `${t.userId}:${t.activityName}`)
    );
    if (lateNightGames.size > 0) {
        return triggers.filter(
            (t) => t.triggerType !== 'game_start' || !lateNightGames.has(`${t.userId}:${t.activityName}`)
        );
    }
    return triggers;
}

test('late_night supersedes game_start for same user+game', () => {
    const state = freshState();
    // Config that forces late_night to fire (very wide window)
    const config = {
        game_start: { enabled: true, cooldownMinutes: 90 },
        late_night: { enabled: true, cooldownMinutes: 360, startHour: 0, endHour: 24 }, // always fires
        long_session: { enabled: false, cooldownMinutes: 360, thresholdMinutes: 180 },
        group_gaming: { enabled: false, cooldownMinutes: 240, minPlayers: 3 },
        streaming: { enabled: false, cooldownMinutes: 60 },
        comeback: { enabled: false, cooldownMinutes: 1440, absenceMinutes: 1440 },
    };
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const raw = detectAll(oldP, newP, state, config);

    // Both should fire before dedup
    assert(raw.some((r) => r.triggerType === 'game_start'), 'game_start fires raw');
    assert(raw.some((r) => r.triggerType === 'late_night'), 'late_night fires raw');

    // After dedup, game_start should be removed
    const deduped = deduplicateTriggers(raw);
    assert(!deduped.some((r) => r.triggerType === 'game_start'), 'game_start removed after dedup');
    assert(deduped.some((r) => r.triggerType === 'late_night'), 'late_night kept after dedup');
});

test('game_start preserved when late_night does NOT fire', () => {
    const state = freshState();
    const config = {
        game_start: { enabled: true, cooldownMinutes: 90 },
        late_night: { enabled: true, cooldownMinutes: 360, startHour: 99, endHour: 99 }, // never fires
        long_session: { enabled: false, cooldownMinutes: 360, thresholdMinutes: 180 },
        group_gaming: { enabled: false, cooldownMinutes: 240, minPlayers: 3 },
        streaming: { enabled: false, cooldownMinutes: 60 },
        comeback: { enabled: false, cooldownMinutes: 1440, absenceMinutes: 1440 },
    };
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const raw = detectAll(oldP, newP, state, config);
    const deduped = deduplicateTriggers(raw);
    assert(deduped.some((r) => r.triggerType === 'game_start'), 'game_start preserved');
});

// --- Cooldown integration ---
test('cooldown blocks repeat triggers', () => {
    cooldown.clear();
    cooldown.record('u1', 'game_start');
    const { allowed } = cooldown.check('u1', 'game_start', 90);
    assert.strictEqual(allowed, false, 'blocked by cooldown');
});

test('cooldown allows different trigger types independently', () => {
    cooldown.clear();
    cooldown.record('u1', 'game_start');
    const { allowed } = cooldown.check('u1', 'streaming', 60);
    assert.strictEqual(allowed, true, 'streaming allowed despite game_start cooldown');
});

// --- Bot filtering ---
test('listener module exports expected functions', () => {
    const listener = require('../activity/listener');
    assert(typeof listener.handlePresenceUpdate === 'function', 'handlePresenceUpdate exported');
    assert(typeof listener.handleVoiceStateUpdate === 'function', 'handleVoiceStateUpdate exported');
    assert(typeof listener.init === 'function', 'init exported');
    assert(typeof listener.shutdown === 'function', 'shutdown exported');
    assert(listener.trackingState, 'trackingState exported');
    assert(listener.trackingState.gameStartTimes instanceof Map, 'gameStartTimes is a Map');
    assert(listener.trackingState.lastSeen instanceof Map, 'lastSeen is a Map');
});

// --- Deliver module exports ---
test('deliver module exports expected functions', () => {
    const deliver = require('../activity/deliver');
    assert(typeof deliver.deliver === 'function', 'deliver exported');
    assert(typeof deliver.generateMessage === 'function', 'generateMessage exported');
    assert(typeof deliver.findActivityChannel === 'function', 'findActivityChannel exported');
});

// --- Fallback messages ---
test('generateMessage returns fallback when no API key', async () => {
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
        const { generateMessage } = require('../activity/deliver');
        const msg = await generateMessage('game_start', { game: 'Arma 3' });
        assert(typeof msg === 'string' && msg.length > 0, 'returns non-empty fallback');
        assert(msg.includes('Arma 3'), 'fallback includes game name');
    } finally {
        if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
    }
});

// --- Supabase helper ---
test('supabase activity-listeners module exports expected functions', () => {
    const db = require('../supabase/activity-listeners');
    assert(typeof db.logActivityEvent === 'function', 'logActivityEvent exported');
    assert(typeof db.getRecentEventsForUser === 'function', 'getRecentEventsForUser exported');
});

(async () => {
    await testAsync('generateMessage returns fallback when no API key', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        try {
            const { generateMessage } = require('../activity/deliver');
            const msg = await generateMessage('game_start', { game: 'Arma 3' });
            assert(typeof msg === 'string' && msg.length > 0, 'returns non-empty fallback');
            assert(msg.includes('Arma 3'), 'fallback includes game name');
        } finally {
            if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
        }
    });

    await testAsync('all trigger types have fallback messages', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        try {
            const { generateMessage } = require('../activity/deliver');
            const cases = [
                ['game_start', { game: 'Test' }],
                ['late_night', { game: 'Test', hour: 2 }],
                ['long_session', { game: 'Test', hoursPlayed: 4 }],
                ['group_gaming', { game: 'Test', playerCount: 3 }],
                ['streaming', { stream: 'Twitch' }],
                ['go_live', { channelName: 'annex' }],
                ['comeback', { hoursAway: 25 }],
            ];
            for (const [type, ctx] of cases) {
                const msg = await generateMessage(type, ctx);
                assert(typeof msg === 'string' && msg.length > 0, `${type} has fallback`);
            }
        } finally {
            if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
        }
    });

    console.log(`\nActivity listener tests: ${passed} passed, ${failed} failed`);
})();
