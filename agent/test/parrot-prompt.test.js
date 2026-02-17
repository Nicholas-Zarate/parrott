/**
 * Parrot config: getTones(), getSystemPromptSections(), getToolDescriptions(), runtime getters.
 * All data from Supabase only; when PARROT_TONES_SOURCE is not supabase or DB not populated, getTones() returns null.
 * Run from agent/: node test/parrot-prompt.test.js
 */
const assert = require('assert');
const parrotConfig = require('../config/parrot');

// When not using Supabase (or cache empty), getTones() returns null
const tones = parrotConfig.getTones();
if (tones) {
    assert(typeof tones === 'object' && !Array.isArray(tones), 'getTones() returns object or null');
    if (tones.text) {
        assert(typeof tones.text.task === 'string', 'tones.text.task is string');
        assert(typeof tones.text.constraints === 'string', 'tones.text.constraints is string');
    }
}

// getSystemPromptSections always returns shape with role, voice, task, constraints, tools (may be empty strings when no DB)
const sections = parrotConfig.getSystemPromptSections();
assert(typeof sections === 'object', 'getSystemPromptSections() returns object');
assert('role' in sections && 'voice' in sections && 'task' in sections && 'constraints' in sections && 'tools' in sections, 'sections have required keys');
assert(typeof sections.role === 'string' && typeof sections.voice === 'string', 'role and voice are strings');
assert(sections.voiceWeights === undefined || typeof sections.voiceWeights === 'string', 'sections.voiceWeights is optional string');
assert(sections.toolVoiceWeights === undefined || typeof sections.toolVoiceWeights === 'string', 'sections.toolVoiceWeights is optional string');

// buildSystemPrompt produces a string (may be empty when no personality configured)
const fullWithTools = parrotConfig.getSystemPromptWithTools();
assert(typeof fullWithTools === 'string', 'getSystemPromptWithTools() returns string');

// getToolDescriptions returns object (empty when not from DB)
const toolDescs = parrotConfig.getToolDescriptions();
assert(typeof toolDescs === 'object' && toolDescs !== null, 'getToolDescriptions() returns object');
assert(!Array.isArray(toolDescs), 'getToolDescriptions() is not array');

// Runtime config getters: from Supabase only; may be null when not set
assert(parrotConfig.model === null || (typeof parrotConfig.model === 'string' && parrotConfig.model.length > 0), 'parrotConfig.model is string or null');
assert(parrotConfig.max_completion_tokens === null || (Number.isFinite(parrotConfig.max_completion_tokens) && parrotConfig.max_completion_tokens > 0), 'max_completion_tokens is number or null');
assert(parrotConfig.max_prompt_tokens === null || (Number.isFinite(parrotConfig.max_prompt_tokens) && parrotConfig.max_prompt_tokens > 0), 'max_prompt_tokens is number or null');

async function runAsyncChecks() {
    await parrotConfig.refreshPromptConfig();
    const sectionsAfterRefresh = parrotConfig.getSystemPromptSections();
    assert(typeof sectionsAfterRefresh === 'object' && 'tools' in sectionsAfterRefresh, 'sections after refresh have tools key');
}

runAsyncChecks()
    .then(() => {
        console.log('Parrot prompt test: OK');
        console.log('  getTones():', tones ? 'object with ' + Object.keys(tones).length + ' keys' : 'null');
        console.log('  getSystemPromptSections(): shape with role, voice, task, constraints, tools');
        console.log('  getSystemPromptWithTools(): length =', fullWithTools.length);
        console.log('  getToolDescriptions():', Object.keys(toolDescs).length, 'keys');
    })
    .catch((err) => {
        console.error('Parrot prompt test failed:', err);
        process.exit(1);
    });
