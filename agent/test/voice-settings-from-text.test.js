/**
 * Unit tests for TTS voice settings derived from text.
 * See instructions/tts-voice-settings-from-text/PLAN_TTS_VOICE_SETTINGS_FROM_TEXT_TESTS.md
 * Run from agent/: node test/voice-settings-from-text.test.js
 */
const assert = require('assert');
const prevDeriveEnv = process.env.TTS_DERIVE_SETTINGS_FROM_TEXT;
process.env.TTS_DERIVE_SETTINGS_FROM_TEXT = ''; // ensure derivation is on for tests
const { deriveVoiceSettingsFromText, mergeVoiceSettings } = require('../abilities/voice/tts');

const derive = deriveVoiceSettingsFromText;

function wordCount(str) {
    return String(str || '').trim().split(/\s+/).filter(Boolean).length;
}

// --- deriveVoiceSettingsFromText: length ---
const short1 = 'Yo';
const short2 = 'We won';
const short3 = 'Hey there';
assert(wordCount(short1) >= 1 && wordCount(short1) <= 3);
const s1 = derive(short1);
assert(s1.speed >= 1.0 && s1.speed <= 2, 'short phrase: speed in valid range');
assert(s1.stability >= 0 && s1.stability <= 0.5, 'short phrase: stability snappier (≤0.5)');

const medium = "Hello there, it's great to see you.";
assert(wordCount(medium) >= 4 && wordCount(medium) <= 10);
const m1 = derive(medium);
assert(!m1.speed || (m1.speed >= 0.5 && m1.speed <= 2), 'medium: speed if present in range');
assert(!m1.stability || (m1.stability >= 0 && m1.stability <= 1), 'medium: stability if present in range');

const long = 'This is a sentence that has more than ten words in it for testing the long phrase rule.';
assert(wordCount(long) >= 11);
const l1 = derive(long);
assert(l1.speed >= 0.5 && l1.speed <= 1, 'long phrase: speed slower (e.g. 0.9)');
assert(l1.stability >= 0.5 && l1.stability <= 1, 'long phrase: stability calmer (e.g. 0.6)');

// --- deriveVoiceSettingsFromText: punctuation ---
const shortExcl = 'We won!';
const e1 = derive(shortExcl);
assert(e1.stability !== undefined && e1.stability <= 0.5, 'short + !: stability expressive');

const question = 'Really?';
const q1 = derive(question);
assert(q1.stability === undefined || q1.stability <= 0.5, 'question: stability if set is ≤0.5');

// --- deriveVoiceSettingsFromText: edge cases ---
const empty = derive('');
assert.deepStrictEqual(empty, {}, 'empty string: no overrides');

const whitespace = derive('   ');
assert.deepStrictEqual(whitespace, {}, 'whitespace only: no overrides');

const punctOnly = derive('!');
const p1 = derive('!');
assert(typeof p1 === 'object' && p1 !== null, 'punctuation only: no crash');
assert(p1.speed === undefined || (p1.speed >= 0.5 && p1.speed <= 2), 'punctuation only: speed in range if set');
assert(p1.stability === undefined || (p1.stability >= 0 && p1.stability <= 1), 'punctuation only: stability in range if set');

// --- determinism ---
const twice1 = derive(short2);
const twice2 = derive(short2);
assert.deepStrictEqual(twice1, twice2, 'determinism: same input → same output');

// --- valid ranges for any input ---
const inputs = ['Yo', 'Hello world.', 'A very long sentence that goes on and on for many words here.', '!', ''];
inputs.forEach((t) => {
    const o = derive(t);
    if (o.speed !== undefined) assert(o.speed >= 0.5 && o.speed <= 2, `speed in [0.5,2] for "${t.slice(0, 20)}"`);
    if (o.stability !== undefined) assert(o.stability >= 0 && o.stability <= 1, `stability in [0,1] for "${t.slice(0, 20)}"`);
});

// --- merge order: caller overrides win ---
const merged = mergeVoiceSettings({ speed: 1.2, stability: 0.4 });
assert(merged.speed >= 1.15 && merged.speed <= 1.25, 'merge: caller speed applied');
assert(merged.stability >= 0.35 && merged.stability <= 0.45, 'merge: caller stability applied');

console.log('voice-settings-from-text tests: OK');
console.log('  deriveVoiceSettingsFromText: short/medium/long, punctuation, edge cases, determinism, ranges');
console.log('  mergeVoiceSettings: accepts overrides');
if (prevDeriveEnv !== undefined) process.env.TTS_DERIVE_SETTINGS_FROM_TEXT = prevDeriveEnv;
else delete process.env.TTS_DERIVE_SETTINGS_FROM_TEXT;
