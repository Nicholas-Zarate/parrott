/**
 * Tests for pipeline keyword trigger (parrott / sir parrott). Tests regex and extraction only.
 * Run from agent/: node test/voice/pipeline-keyword.test.js
 */
const path = require('path');
const assert = require('assert');
const { extractAfterTrigger } = require(path.join(__dirname, '../../abilities/voice/keyword-trigger'));

// ─── Same-utterance: content after keyword ────────────────────────

assert.strictEqual(extractAfterTrigger('Sir parrott what is the weather?'), 'what is the weather?');
assert.strictEqual(extractAfterTrigger('parrott tell me a joke'), 'tell me a joke');
assert.strictEqual(extractAfterTrigger('sir parrott  hello'), 'hello');
assert.strictEqual(extractAfterTrigger('Hey sir parrott, say something'), 'say something');
assert.strictEqual(extractAfterTrigger('hey parrot what is the weather'), 'what is the weather');
assert.strictEqual(extractAfterTrigger('parrot without double t'), 'without double t');

// ─── Keyword only or at end → empty remainder (next-utterance path) ─────────────────

assert.strictEqual(extractAfterTrigger('parrott'), '');
assert.strictEqual(extractAfterTrigger('parrot'), '');
assert.strictEqual(extractAfterTrigger('sir parrott'), '');
assert.strictEqual(extractAfterTrigger('  parrott  '), '');
assert.strictEqual(extractAfterTrigger('okay parrott.'), '');
assert.strictEqual(extractAfterTrigger('hey parrot'), '');

// ─── No trigger ──────────────────────────────────────────────────

assert.strictEqual(extractAfterTrigger('hello world'), null);
assert.strictEqual(extractAfterTrigger(''), null);

console.log('  PARROTT_TRIGGER_REGEX extraction: OK');
console.log('pipeline-keyword.test.js: all passed');
