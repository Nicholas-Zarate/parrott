/**
 * restricted-roles: getBlockedRoleNames and hasBlockedRole.
 * Run from agent/: node test/restricted-roles.test.js
 */
const assert = require('assert');

const {
    getBlockedRoleNames,
    hasBlockedRole,
    resetBlockedRoleNamesCache,
} = require('../../abilities/restricted-roles');

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

console.log('restricted-roles tests:');

test('getBlockedRoleNames returns empty when env unset', () => {
    resetBlockedRoleNamesCache();
    delete process.env.BLOCKED_DISCORD_ROLE_NAMES;
    const names = getBlockedRoleNames();
    assert(Array.isArray(names) && names.length === 0);
});

test('getBlockedRoleNames returns lowercased list when set', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'Wanderer,  Guest ,';
    const names = getBlockedRoleNames();
    assert.deepStrictEqual(names, ['wanderer', 'guest']);
});

test('hasBlockedRole returns false when member is null', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'Wanderer';
    assert.strictEqual(hasBlockedRole(null), false);
    assert.strictEqual(hasBlockedRole(undefined), false);
});

test('hasBlockedRole returns false when member has no roles cache', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'Wanderer';
    assert.strictEqual(hasBlockedRole({}), false);
    assert.strictEqual(hasBlockedRole({ roles: {} }), false);
});

test('hasBlockedRole returns false when member has no matching role', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'Wanderer';
    const cache = new Map();
    cache.set('1', { name: 'Member' });
    cache.set('2', { name: 'Other' });
    const member = { roles: { cache } };
    assert.strictEqual(hasBlockedRole(member), false);
});

test('hasBlockedRole returns true when member has matching role', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'Wanderer,Guest';
    const cache = new Map();
    cache.set('1', { name: 'Member' });
    cache.set('2', { name: 'Wanderer' });
    const member = { roles: { cache } };
    assert.strictEqual(hasBlockedRole(member), true);
});

test('hasBlockedRole is case-insensitive', () => {
    resetBlockedRoleNamesCache();
    process.env.BLOCKED_DISCORD_ROLE_NAMES = 'wanderer';
    const cache = new Map();
    cache.set('1', { name: 'WANDERER' });
    const member = { roles: { cache } };
    assert.strictEqual(hasBlockedRole(member), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
