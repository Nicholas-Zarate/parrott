/**
 * Unit tests for voice-dimensions buildWeightsLine and getVoiceDimensionsFromSupabase.
 * Run from agent/: node test/voice-dimensions.test.js
 */
const assert = require('assert');
const { buildWeightsLine, getVoiceDimensionsFromSupabase } = require('../supabase/voice-dimensions');

// --- buildWeightsLine ---
const normal = buildWeightsLine({ snarky: 70, chill: 30, witty: 80, sarcastic: 60, sassy: 75 });
assert(typeof normal === 'string' && normal.length > 0, 'normal dimensions produce non-empty line');
assert(normal.includes('snarky 70'), 'line contains snarky 70');
assert(normal.includes('chill 30'), 'line contains chill 30');
assert(normal.includes('Prioritize these'), 'line contains instruction');

const allZeros = buildWeightsLine({ snarky: 0, chill: 0, witty: 0, sarcastic: 0, sassy: 0 });
assert(allZeros === '', 'all zeros returns empty string (skip so model is not told prioritize zero)');

assert(buildWeightsLine(null) === '', 'null returns empty string');
assert(buildWeightsLine(undefined) === '', 'undefined returns empty string');
assert(buildWeightsLine({}) === '', 'empty object returns empty string (no dimension keys)');

const oneNonZero = buildWeightsLine({ snarky: 1, chill: 0, witty: 0, sarcastic: 0, sassy: 0 });
assert(oneNonZero.length > 0 && oneNonZero.includes('snarky 1'), 'one non-zero produces line');

// Clamping: out-of-range values are clamped
const clamped = buildWeightsLine({ snarky: 150, chill: -10, witty: 50, sarcastic: 50, sassy: 50 });
assert(clamped.includes('snarky 100') && clamped.includes('chill 0'), 'out-of-range values are clamped');

console.log('voice-dimensions.test.js: buildWeightsLine tests OK');

// getVoiceDimensionsFromSupabase: without Supabase env returns {}
async function runFetch() {
    const result = await getVoiceDimensionsFromSupabase();
    assert(typeof result === 'object' && result !== null && !Array.isArray(result), 'returns object');
    // With no Supabase URL/key we get {}; with Supabase we may get { global: {...}, tools: {...} }
    console.log('  getVoiceDimensionsFromSupabase() returned', Object.keys(result).length, 'scopes');
}

runFetch()
    .then(() => {
        console.log('voice-dimensions.test.js: all OK');
    })
    .catch((err) => {
        console.error('voice-dimensions.test.js failed:', err);
        process.exit(1);
    });
