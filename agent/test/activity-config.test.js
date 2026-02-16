/**
 * Activity config: verify structure, defaults, and toggleability.
 * Run from agent/: node test/activity-config.test.js
 */
const assert = require('assert');
const config = require('../config/activity');

// --- Top-level config ---
assert(typeof config.channelName === 'string' && config.channelName.length > 0, 'channelName is a non-empty string');
assert(typeof config.dmUser === 'boolean', 'dmUser is a boolean');
assert(typeof config.voiceIfConnected === 'boolean', 'voiceIfConnected is a boolean');

// --- Triggers object ---
assert(config.triggers && typeof config.triggers === 'object', 'triggers object exists');

const expectedTriggers = ['game_start', 'late_night', 'long_session', 'group_gaming', 'streaming', 'comeback'];
for (const name of expectedTriggers) {
    const t = config.triggers[name];
    assert(t, `trigger "${name}" exists`);
    assert(typeof t.enabled === 'boolean', `${name}.enabled is boolean`);
    assert(typeof t.cooldownMinutes === 'number' && t.cooldownMinutes > 0, `${name}.cooldownMinutes is a positive number`);
}

// --- Specific cooldown values ---
assert.strictEqual(config.triggers.game_start.cooldownMinutes, 90, 'game_start cooldown is 90 minutes');
assert.strictEqual(config.triggers.streaming.cooldownMinutes, 60, 'streaming cooldown is 60 minutes');
assert.strictEqual(config.triggers.late_night.cooldownMinutes, 360, 'late_night cooldown is 360 minutes');
assert.strictEqual(config.triggers.long_session.cooldownMinutes, 360, 'long_session cooldown is 360 minutes');
assert.strictEqual(config.triggers.group_gaming.cooldownMinutes, 240, 'group_gaming cooldown is 240 minutes');
assert.strictEqual(config.triggers.comeback.cooldownMinutes, 1440, 'comeback cooldown is 1440 minutes');

// --- Trigger-specific options ---
assert(typeof config.triggers.late_night.startHour === 'number', 'late_night has startHour');
assert(typeof config.triggers.late_night.endHour === 'number', 'late_night has endHour');
assert(typeof config.triggers.long_session.thresholdMinutes === 'number', 'long_session has thresholdMinutes');
assert(typeof config.triggers.group_gaming.minPlayers === 'number', 'group_gaming has minPlayers');
assert(typeof config.triggers.comeback.absenceMinutes === 'number', 'comeback has absenceMinutes');

// --- All triggers enabled by default ---
for (const name of expectedTriggers) {
    assert.strictEqual(config.triggers[name].enabled, true, `${name} is enabled by default`);
}

console.log('Activity config test: OK');
console.log('  Triggers:', expectedTriggers.join(', '));
console.log('  Channel:', config.channelName, '| DM:', config.dmUser, '| Voice:', config.voiceIfConnected);
