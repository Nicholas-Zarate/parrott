/**
 * Tests for voice-chat-events (detectEvents). No API calls.
 * Run from agent/: node test/voice/voice-chat-events.test.js
 */
const path = require('path');
const assert = require('assert');
const { detectEvents, getVoiceChatEvents } = require(path.join(__dirname, '../../abilities/voice/voice-chat-events'));

// ─── detectEvents ─────────────────────────────────────────────────

assert.deepStrictEqual(detectEvents(''), []);
assert.deepStrictEqual(detectEvents(null), []);
assert.deepStrictEqual(detectEvents('  '), []);

assert.deepStrictEqual(detectEvents('I need a medic'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('medic'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('someone got shot'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('we are all dead'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('calling for defib'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('I\'m down, rez me'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('blown up again'), ['game_death_medic']);
assert.deepStrictEqual(detectEvents('got killed by the sniper'), ['game_death_medic']);

assert.deepStrictEqual(detectEvents('hello world'), []);
assert.deepStrictEqual(detectEvents('medics are helpful'), []); // "medics" is one word, \bmedic\b does not match

console.log('  detectEvents: OK');

// ─── getVoiceChatEvents ──────────────────────────────────────────

const events = getVoiceChatEvents();
assert(Array.isArray(events), 'getVoiceChatEvents returns array');
assert(events.length >= 1, 'at least one event defined');
assert(events.some((e) => e.id === 'game_death_medic'), 'game_death_medic present');
assert(events.every((e) => e.id && e.name), 'each event has id and name');

console.log('  getVoiceChatEvents: OK');
console.log('voice-chat-events.test.js: all passed');
