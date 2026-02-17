/**
 * get_personality tool: returns role and voice from getSystemPromptSections().
 * Run from agent/: node test/get-personality-tool.test.js
 */
const assert = require('assert');
const { buildTools } = require('../ai-sdk/with-tools');
const parrotConfig = require('../config/parrot');

async function run() {
    const tools = buildTools({});
    assert(tools.get_personality, 'buildTools() includes get_personality');

    const expected = parrotConfig.getSystemPromptSections();
    assert(expected.role && expected.voice, 'getSystemPromptSections() has role and voice');

    const t = tools.get_personality;
    assert(typeof t.execute === 'function', 'get_personality tool has execute');

    const result = await t.execute({});
    assert(result && typeof result === 'object', 'execute() returns object');
    assert('role' in result && 'voice' in result, 'result has role and voice');
    assert.strictEqual(result.role, expected.role, 'result.role matches getSystemPromptSections().role');
    assert.strictEqual(result.voice, expected.voice, 'result.voice matches getSystemPromptSections().voice');
    if (expected.voiceWeights) assert.strictEqual(result.voiceWeights, expected.voiceWeights, 'result.voiceWeights matches when present');
    if (expected.toolVoiceWeights) assert.strictEqual(result.toolVoiceWeights, expected.toolVoiceWeights, 'result.toolVoiceWeights matches when present');

    console.log('get-personality-tool test: OK');
    console.log('  get_personality.execute() returns role + voice matching getSystemPromptSections()');
}

run().catch((err) => {
    console.error('get-personality-tool test failed:', err);
    process.exit(1);
});
