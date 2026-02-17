/**
 * Activity settings resolver: DB only, fromRow normalization, getResolvedSettings returns null when no row.
 * Run from agent/: node test/activity-settings-resolver.test.js
 * No Supabase required for "no DB" tests (getResolvedSettings returns null).
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

console.log('Activity settings resolver tests:');

const { fromRow, getResolvedSettings } = require('../activity/settings-resolver');

const REQUIRED_KEYS = ['enabled', 'cooldownMinutes', 'deliverChannel', 'deliverDm', 'deliverVoice', 'channelNameOverride', 'config'];

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
    for (const k of REQUIRED_KEYS) assert(out.hasOwnProperty(k), `missing key: ${k}`);
});

test('fromRow handles deliver_channel false', () => {
    const out = fromRow({ deliver_channel: false, deliver_dm: true, deliver_voice: true });
    assert.strictEqual(out.deliverChannel, false);
});

// --- getResolvedSettings (no Supabase = null) ---
(async () => {
    await testAsync('getResolvedSettings returns null when no Supabase', async () => {
        const origUrl = process.env.SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        try {
            const resolved = await getResolvedSettings('123456789', 'go_live');
            assert.strictEqual(resolved, null, 'returns null when Supabase not configured');
        } finally {
            if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
        }
    });

    await testAsync('getResolvedSettings(null, triggerType) returns null when no Supabase', async () => {
        const origUrl = process.env.SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        try {
            const resolved = await getResolvedSettings(null, 'comeback');
            assert.strictEqual(resolved, null);
        } finally {
            if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
        }
    });

    console.log(`\nActivity settings resolver tests: ${passed} passed, ${failed} failed`);
})();
