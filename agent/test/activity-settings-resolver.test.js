/**
 * Activity settings resolver: file fallback, DB row normalization, getResolvedSettings.
 * Run from agent/: node test/activity-settings-resolver.test.js
 * No Supabase required for these tests (they cover file fallback and fromRow shape).
 */
const assert = require('assert');
const activityConfig = require('../config/activity');

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

console.log('Activity settings resolver tests:');

const { fromFile, fromRow, getResolvedSettings } = require('../activity/settings-resolver');

const REQUIRED_KEYS = ['enabled', 'cooldownMinutes', 'deliverChannel', 'deliverDm', 'deliverVoice', 'channelNameOverride', 'config'];

// --- fromFile ---
test('fromFile returns object with all required keys', () => {
    const out = fromFile('game_start');
    for (const k of REQUIRED_KEYS) {
        assert(out.hasOwnProperty(k), `missing key: ${k}`);
    }
});

test('fromFile game_start matches file config', () => {
    const out = fromFile('game_start');
    assert.strictEqual(out.enabled, activityConfig.triggers.game_start.enabled);
    assert.strictEqual(out.cooldownMinutes, activityConfig.triggers.game_start.cooldownMinutes);
    assert.strictEqual(out.deliverChannel, true);
    assert.strictEqual(out.deliverDm, activityConfig.dmUser);
    assert.strictEqual(out.deliverVoice, activityConfig.voiceIfConnected);
    assert.strictEqual(out.channelNameOverride, null);
    assert(typeof out.config === 'object' && out.config !== null);
});

test('fromFile unknown trigger type returns safe defaults', () => {
    const out = fromFile('unknown_trigger');
    assert.strictEqual(out.enabled, true);
    assert.strictEqual(out.cooldownMinutes, 90);
    assert.strictEqual(out.deliverChannel, true);
    assert.strictEqual(out.channelNameOverride, null);
});

// --- fromRow ---
test('fromRow normalizes DB row to camelCase shape', () => {
    const row = {
        enabled: true,
        cooldown_minutes: 60,
        deliver_channel: true,
        deliver_dm: false,
        deliver_voice: true,
        channel_name_override: 'go-live-alerts',
        config: { startHour: 22 },
    };
    const out = fromRow(row);
    assert.strictEqual(out.enabled, true);
    assert.strictEqual(out.cooldownMinutes, 60);
    assert.strictEqual(out.deliverChannel, true);
    assert.strictEqual(out.deliverDm, false);
    assert.strictEqual(out.deliverVoice, true);
    assert.strictEqual(out.channelNameOverride, 'go-live-alerts');
    assert.deepStrictEqual(out.config, { startHour: 22 });
});

test('fromRow handles deliver_channel false', () => {
    const out = fromRow({ deliver_channel: false, deliver_dm: true, deliver_voice: true });
    assert.strictEqual(out.deliverChannel, false);
});

// --- getResolvedSettings (no Supabase = file fallback) ---
(async () => {
    await testAsync('getResolvedSettings returns file-based settings when no DB', async () => {
        const origUrl = process.env.SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        try {
            const resolved = await getResolvedSettings('123456789', 'go_live');
            assert.strictEqual(resolved.enabled, activityConfig.triggers.go_live.enabled);
            assert.strictEqual(resolved.cooldownMinutes, activityConfig.triggers.go_live.cooldownMinutes);
            for (const k of REQUIRED_KEYS) assert(resolved.hasOwnProperty(k), `missing ${k}`);
        } finally {
            if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
        }
    });

    await testAsync('getResolvedSettings(null, triggerType) returns file fallback', async () => {
        const resolved = await getResolvedSettings(null, 'comeback');
        assert.strictEqual(resolved.cooldownMinutes, activityConfig.triggers.comeback.cooldownMinutes);
    });

    console.log(`\nActivity settings resolver tests: ${passed} passed, ${failed} failed`);
})();
