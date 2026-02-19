/**
 * Introspection tool: personality, model, and tools subtools.
 * Run from agent/: node tools/get-personality-tool.test.js
 */
const assert = require('assert');
const { buildTools } = require('../../ai-sdk/with-tools');
const { getProviderLabel, DEFAULT_MODEL } = require('../../ai-sdk/model-provider');
const parrotConfig = require('../../config/parrot');

async function run() {
    const tools = buildTools({});
    assert(tools.introspection, 'buildTools() includes introspection');
    const t = tools.introspection;
    assert(typeof t.execute === 'function', 'introspection tool has execute');

    const expectedSections = parrotConfig.getSystemPromptSections();
    assert('role' in expectedSections && 'voice' in expectedSections, 'getSystemPromptSections() has role and voice keys');

    const personalityResult = await t.execute({ query: 'personality' });
    assert(personalityResult && typeof personalityResult === 'object', 'personality execute() returns object');
    assert('role' in personalityResult && 'voice' in personalityResult, 'personality result has role and voice');
    assert.strictEqual(personalityResult.role, expectedSections.role ?? '', 'personality.role matches getSystemPromptSections().role');
    assert.strictEqual(personalityResult.voice, expectedSections.voice ?? '', 'personality.voice matches getSystemPromptSections().voice');
    if (expectedSections.voiceWeights) assert.strictEqual(personalityResult.voiceWeights, expectedSections.voiceWeights, 'personality.voiceWeights matches when present');
    if (expectedSections.toolVoiceWeights) assert.strictEqual(personalityResult.toolVoiceWeights, expectedSections.toolVoiceWeights, 'personality.toolVoiceWeights matches when present');

    const modelResult = await t.execute({ query: 'model' });
    assert(modelResult && typeof modelResult === 'object', 'model execute() returns object');
    assert('model' in modelResult && 'provider' in modelResult, 'model result has model and provider');
    const expectedModel = parrotConfig.model || DEFAULT_MODEL;
    assert.strictEqual(modelResult.model, expectedModel, 'model result matches parrotConfig.model or DEFAULT_MODEL');
    assert.strictEqual(modelResult.provider, getProviderLabel(expectedModel), 'model result provider matches getProviderLabel()');

    const toolsResult = await t.execute({ query: 'tools' });
    assert(toolsResult && typeof toolsResult === 'object', 'tools execute() returns object');
    assert(Array.isArray(toolsResult.tools), 'tools result has tools array');
    for (const item of toolsResult.tools) {
        assert(typeof item.name === 'string', 'each tool has name');
        assert('description' in item && 'example' in item, 'each tool has description and example');
    }

    console.log('introspection-tool test: OK');
    console.log('  introspection query=personality returns role + voice matching getSystemPromptSections()');
    console.log('  introspection query=model returns model + provider');
    console.log('  introspection query=tools returns tools array with name, description, example');
}

run().catch((err) => {
    console.error('introspection-tool test failed:', err);
    process.exit(1);
});
