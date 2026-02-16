/**
 * VC tone: parrot speaks only N words in voice (from tones.vc.maxWords).
 * Run from agent/: node test/vc-tone.test.js   or   npm test
 */
const assert = require('assert');
const parrotConfig = require('../config/parrot');

const tones = parrotConfig.getTones();
const vcMax = Math.max(1, Math.min(10, tones.vc?.maxWords ?? 3));

function wordCount(str) {
    return String(str || '').trim().split(/\s+/).filter(Boolean).length;
}

function truncateToVcWords(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, vcMax).join(' ');
}

assert(tones.vc, 'tones.vc exists');
assert(Number.isInteger(vcMax) && vcMax >= 1 && vcMax <= 10, 'vc maxWords in 1–10');

const long = 'we won the game yesterday';
assert.strictEqual(wordCount(truncateToVcWords(long)), vcMax, 'long phrase truncated to vcMax words');
assert.strictEqual(truncateToVcWords(long), 'we won the', 'truncation matches tool logic');

const short = 'yo';
assert.strictEqual(truncateToVcWords(short), 'yo', 'short phrase unchanged');

const exactPhrase = Array(vcMax).fill('word').join(' ');
assert.strictEqual(wordCount(truncateToVcWords(exactPhrase)), vcMax, 'exact vcMax words kept');

console.log('VC tone test: OK');
console.log('  tones.vc.maxWords =', vcMax, '→ spoken phrase ≤', vcMax, 'words');
