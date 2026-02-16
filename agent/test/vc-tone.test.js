/**
 * VC tone + VC tool (holla/say): assert tones.vc exists and holla module works.
 * Run from agent/: node test/vc-tone.test.js   or   npm test
 */
const assert = require('assert');
const parrotConfig = require('../config/parrot');
const { generateHollaResponse, FALLBACK_PHRASE } = require('../voice/holla');

const tones = parrotConfig.getTones();

assert(tones.vc, 'tones.vc exists (kept for re-enable)');
assert(tones.vc.maxWords != null, 'tones.vc.maxWords is defined');
assert(Number.isInteger(tones.vc.maxWords) && tones.vc.maxWords >= 1 && tones.vc.maxWords <= 10, 'vc maxWords in 1–10');

assert(typeof FALLBACK_PHRASE === 'string' && FALLBACK_PHRASE.length > 0, 'holla FALLBACK_PHRASE is non-empty string');
assert(typeof generateHollaResponse === 'function', 'generateHollaResponse is a function');

(async () => {
    const result = await generateHollaResponse(null);
    assert(typeof result === 'string', 'generateHollaResponse returns a string');
    assert(result.length > 0, 'generateHollaResponse returns non-empty (fallback when no VC/API)');
    console.log('VC tone test: OK');
    console.log('  tones.vc present, maxWords =', tones.vc.maxWords, '(re-enable via PLAN_VC_TOOL_HOLLA_SAY.md)');
    console.log('  holla module: generateHollaResponse(null) →', result.slice(0, 40) + (result.length > 40 ? '…' : ''));
})();
