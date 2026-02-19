/**
 * Activity triggers: verify detection logic for all 6 trigger types.
 * Uses mock presence objects — no Discord connection needed.
 * Run from agent/: node test/activity-triggers.test.js
 */
const assert = require('assert');
const { detectAll, getActivityNames } = require('../../activity/triggers');

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

/** Create a mock presence object. */
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
        guild: opts.guild ?? {
            members: {
                cache: new Map(),
            },
        },
    };
}

/** Fresh tracking state for each test group. */
function freshState() {
    return {
        gameStartTimes: new Map(),
        lastSeen: new Map(),
    };
}

/** All triggers enabled config. */
const allTriggersConfig = {
    game_start: { enabled: true, cooldownMinutes: 90 },
    late_night: { enabled: true, cooldownMinutes: 360, startHour: 0, endHour: 5 },
    long_session: { enabled: true, cooldownMinutes: 360, thresholdMinutes: 180 },
    group_gaming: { enabled: true, cooldownMinutes: 240, minPlayers: 3 },
    streaming: { enabled: true, cooldownMinutes: 60 },
    comeback: { enabled: true, cooldownMinutes: 1440, absenceMinutes: 1440 },
};

console.log('Activity triggers tests:');

// --- getActivityNames ---
test('getActivityNames returns empty set for null presence', () => {
    const names = getActivityNames(null, 0);
    assert.strictEqual(names.size, 0);
});

test('getActivityNames filters by activity type', () => {
    const presence = mockPresence('u1', {
        activities: [
            { type: 0, name: 'Arma 3' },
            { type: 1, name: 'Twitch' },
            { type: 0, name: 'Minecraft' },
        ],
    });
    const playing = getActivityNames(presence, 0);
    assert.strictEqual(playing.size, 2);
    assert(playing.has('Arma 3'));
    assert(playing.has('Minecraft'));
    const streaming = getActivityNames(presence, 1);
    assert.strictEqual(streaming.size, 1);
    assert(streaming.has('Twitch'));
});

// --- game_start ---
test('game_start fires when a new game appears', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const gs = results.filter((r) => r.triggerType === 'game_start');
    assert.strictEqual(gs.length, 1);
    assert.strictEqual(gs[0].activityName, 'THE FINALS');
    assert.strictEqual(gs[0].userId, 'u1');
});

test('game_start does NOT fire for same game continuing', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const gs = results.filter((r) => r.triggerType === 'game_start');
    assert.strictEqual(gs.length, 0);
});

test('game_start tracks session start time', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    detectAll(oldP, newP, state, allTriggersConfig);
    assert(state.gameStartTimes.has('u1:Arma 3'), 'session start tracked');
});

test('game_start cleans up ended sessions', () => {
    const state = freshState();
    state.gameStartTimes.set('u1:Arma 3', Date.now() - 60000);
    const oldP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const newP = mockPresence('u1', { activities: [] });
    detectAll(oldP, newP, state, allTriggersConfig);
    assert(!state.gameStartTimes.has('u1:Arma 3'), 'ended session cleaned up');
});

// --- streaming ---
test('streaming fires when user starts streaming', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 1, name: 'Twitch' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const st = results.filter((r) => r.triggerType === 'streaming');
    assert.strictEqual(st.length, 1);
    assert.strictEqual(st[0].activityName, 'Twitch');
});

test('streaming does NOT fire for ongoing stream', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [{ type: 1, name: 'Twitch' }] });
    const newP = mockPresence('u1', { activities: [{ type: 1, name: 'Twitch' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const st = results.filter((r) => r.triggerType === 'streaming');
    assert.strictEqual(st.length, 0);
});

// --- long_session ---
test('long_session fires after threshold', () => {
    const state = freshState();
    // Simulate game started 4 hours ago
    state.gameStartTimes.set('u1:Arma 3', Date.now() - (4 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const ls = results.filter((r) => r.triggerType === 'long_session');
    assert.strictEqual(ls.length, 1);
    assert(ls[0].context.hoursPlayed >= 3.9, 'hoursPlayed is approximately correct');
});

test('long_session does NOT fire before threshold', () => {
    const state = freshState();
    // Simulate game started 1 hour ago (under 3h threshold)
    state.gameStartTimes.set('u1:Arma 3', Date.now() - (1 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const ls = results.filter((r) => r.triggerType === 'long_session');
    assert.strictEqual(ls.length, 0);
});

test('long_session resets timer after firing', () => {
    const state = freshState();
    state.gameStartTimes.set('u1:Arma 3', Date.now() - (4 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] });
    detectAll(oldP, newP, state, allTriggersConfig);
    // Timer should be reset to ~now
    const resetTime = state.gameStartTimes.get('u1:Arma 3');
    assert(Date.now() - resetTime < 1000, 'timer reset to now after firing');
});

// --- comeback ---
test('comeback fires when user returns after long absence', () => {
    const state = freshState();
    // User was last seen 25 hours ago
    state.lastSeen.set('u1', Date.now() - (25 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { status: 'offline', activities: [] });
    const newP = mockPresence('u1', { status: 'online', activities: [] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const cb = results.filter((r) => r.triggerType === 'comeback');
    assert.strictEqual(cb.length, 1);
    assert(cb[0].context.hoursAway >= 24, 'hoursAway is at least 24');
});

test('comeback does NOT fire for short absence', () => {
    const state = freshState();
    // User was last seen 2 hours ago (under 24h threshold)
    state.lastSeen.set('u1', Date.now() - (2 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { status: 'offline', activities: [] });
    const newP = mockPresence('u1', { status: 'online', activities: [] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const cb = results.filter((r) => r.triggerType === 'comeback');
    assert.strictEqual(cb.length, 0);
});

test('comeback does NOT fire for first-time user (no baseline)', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { status: 'offline', activities: [] });
    const newP = mockPresence('u1', { status: 'online', activities: [] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const cb = results.filter((r) => r.triggerType === 'comeback');
    assert.strictEqual(cb.length, 0);
});

test('comeback records lastSeen when user goes offline', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { status: 'online', activities: [] });
    const newP = mockPresence('u1', { status: 'offline', activities: [] });
    detectAll(oldP, newP, state, allTriggersConfig);
    assert(state.lastSeen.has('u1'), 'lastSeen recorded on offline transition');
});

test('comeback does NOT fire when already online (status change)', () => {
    const state = freshState();
    state.lastSeen.set('u1', Date.now() - (25 * 60 * 60 * 1000));
    const oldP = mockPresence('u1', { status: 'online', activities: [] });
    const newP = mockPresence('u1', { status: 'idle', activities: [] });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const cb = results.filter((r) => r.triggerType === 'comeback');
    assert.strictEqual(cb.length, 0);
});

// --- group_gaming ---
test('group_gaming fires when minPlayers reached', () => {
    const state = freshState();
    const guildMembers = new Map();
    // 2 existing players already playing Arma 3
    for (let i = 1; i <= 2; i++) {
        guildMembers.set(`player${i}`, {
            user: { bot: false },
            presence: mockPresence(`player${i}`, { activities: [{ type: 0, name: 'Arma 3' }] }),
        });
    }
    // The triggering user (3rd player) is also in guild cache with updated presence
    guildMembers.set('u1', {
        user: { bot: false },
        presence: mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] }),
    });

    const guild = { members: { cache: guildMembers } };
    const oldP = mockPresence('u1', { activities: [], guild });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }], guild });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const gg = results.filter((r) => r.triggerType === 'group_gaming');
    assert.strictEqual(gg.length, 1);
    assert.strictEqual(gg[0].context.playerCount, 3);
    assert.strictEqual(gg[0].context.game, 'Arma 3');
});

test('group_gaming does NOT fire below minPlayers', () => {
    const state = freshState();
    const guildMembers = new Map();
    // Only 1 existing player
    guildMembers.set('player1', {
        user: { bot: false },
        presence: mockPresence('player1', { activities: [{ type: 0, name: 'Arma 3' }] }),
    });
    guildMembers.set('u1', {
        user: { bot: false },
        presence: mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }] }),
    });

    const guild = { members: { cache: guildMembers } };
    const oldP = mockPresence('u1', { activities: [], guild });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }], guild });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const gg = results.filter((r) => r.triggerType === 'group_gaming');
    assert.strictEqual(gg.length, 0);
});

// --- disabled triggers ---
test('disabled triggers do not fire', () => {
    const state = freshState();
    const disabledConfig = {
        game_start: { enabled: false, cooldownMinutes: 90 },
        late_night: { enabled: false, cooldownMinutes: 360, startHour: 0, endHour: 5 },
        long_session: { enabled: false, cooldownMinutes: 360, thresholdMinutes: 180 },
        group_gaming: { enabled: false, cooldownMinutes: 240, minPlayers: 3 },
        streaming: { enabled: false, cooldownMinutes: 60 },
        comeback: { enabled: false, cooldownMinutes: 1440, absenceMinutes: 1440 },
    };
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'Arma 3' }, { type: 1, name: 'Twitch' }] });
    const results = detectAll(oldP, newP, state, disabledConfig);
    assert.strictEqual(results.length, 0);
});

// --- null oldPresence ---
test('handles null oldPresence gracefully (first event for user)', () => {
    const state = freshState();
    const newP = mockPresence('u1', { activities: [{ type: 0, name: 'THE FINALS' }] });
    const results = detectAll(null, newP, state, allTriggersConfig);
    const gs = results.filter((r) => r.triggerType === 'game_start');
    assert.strictEqual(gs.length, 1, 'game_start fires for first-time appearance');
});

// --- multiple games at once ---
test('fires for each new game when user starts multiple', () => {
    const state = freshState();
    const oldP = mockPresence('u1', { activities: [] });
    const newP = mockPresence('u1', {
        activities: [
            { type: 0, name: 'Arma 3' },
            { type: 0, name: 'Discord' },
        ],
    });
    const results = detectAll(oldP, newP, state, allTriggersConfig);
    const gs = results.filter((r) => r.triggerType === 'game_start');
    assert.strictEqual(gs.length, 2);
});

console.log(`\nActivity triggers tests: ${passed} passed, ${failed} failed`);
