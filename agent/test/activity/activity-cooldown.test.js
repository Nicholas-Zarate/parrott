/**
 * Activity cooldown: verify check/record, expiry, and pruning.
 * Run from agent/: node test/activity-cooldown.test.js
 */
const assert = require('assert');
const cooldown = require('../../activity/cooldown');

let passed = 0;

function test(name, fn) {
    cooldown.clear();
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

console.log('Activity cooldown tests:');

test('allows first trigger (no prior record)', () => {
    const { allowed } = cooldown.check('user1', 'game_start', 90);
    assert.strictEqual(allowed, true);
});

test('blocks trigger within cooldown window', () => {
    cooldown.record('user1', 'game_start');
    const { allowed, retryAfterMs } = cooldown.check('user1', 'game_start', 90);
    assert.strictEqual(allowed, false);
    assert(retryAfterMs > 0, 'retryAfterMs is positive');
    assert(retryAfterMs <= 90 * 60 * 1000, 'retryAfterMs does not exceed cooldown');
});

test('different trigger types have independent cooldowns', () => {
    cooldown.record('user1', 'game_start');
    const { allowed: gameBlocked } = cooldown.check('user1', 'game_start', 90);
    const { allowed: streamAllowed } = cooldown.check('user1', 'streaming', 60);
    assert.strictEqual(gameBlocked, false);
    assert.strictEqual(streamAllowed, true);
});

test('different users have independent cooldowns', () => {
    cooldown.record('user1', 'game_start');
    const { allowed: user1Blocked } = cooldown.check('user1', 'game_start', 90);
    const { allowed: user2Allowed } = cooldown.check('user2', 'game_start', 90);
    assert.strictEqual(user1Blocked, false);
    assert.strictEqual(user2Allowed, true);
});

test('allows trigger after cooldown expires (simulated)', () => {
    // Manually set a timestamp in the past by recording and manipulating time
    cooldown.record('user1', 'game_start');
    // Check with a very small cooldown (0.001 minutes = 60ms) — should expire almost instantly
    // We need to wait briefly
    const start = Date.now();
    while (Date.now() - start < 70) { /* spin wait 70ms */ }
    const { allowed } = cooldown.check('user1', 'game_start', 0.001);
    assert.strictEqual(allowed, true, 'trigger allowed after tiny cooldown expires');
});

test('prune removes old entries', () => {
    cooldown.record('user1', 'game_start');
    cooldown.record('user2', 'streaming');
    // Wait a few ms so entries are older than maxAge=1
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin wait */ }
    cooldown.prune(1);
    const { allowed: a1 } = cooldown.check('user1', 'game_start', 9999);
    const { allowed: a2 } = cooldown.check('user2', 'streaming', 9999);
    assert.strictEqual(a1, true, 'user1 allowed after prune');
    assert.strictEqual(a2, true, 'user2 allowed after prune');
});

test('startCleanup and stopCleanup are idempotent', () => {
    cooldown.startCleanup();
    cooldown.startCleanup(); // should not throw
    cooldown.stopCleanup();
    cooldown.stopCleanup(); // should not throw
});

console.log(`Activity cooldown tests: ${passed} passed`);
