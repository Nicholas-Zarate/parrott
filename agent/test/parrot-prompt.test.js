/**
 * Phase 1: Parrot config tones and system prompt sections.
 * Verifies getTones() and getSystemPromptSections() return expected shape with fallbacks.
 * Run from agent/: node test/parrot-prompt.test.js
 */
const assert = require('assert');
const parrotConfig = require('../config/parrot');

// Phase 1: When not using Supabase, getTones() returns default tones with text and vc
const tones = parrotConfig.getTones();
assert(tones, 'getTones() returns object');
assert(tones.text, 'tones.text exists');
assert(typeof tones.text.task === 'string' && tones.text.task.length > 0, 'tones.text.task is non-empty string');
assert(typeof tones.text.constraints === 'string', 'tones.text.constraints is string');
assert(tones.vc, 'tones.vc exists');
assert(typeof tones.vc.task === 'string' && tones.vc.task.length > 0, 'tones.vc.task is non-empty string');

// getSystemPromptSections returns role, voice, task, constraints, tools; optionally voiceWeights, toolVoiceWeights
const sections = parrotConfig.getSystemPromptSections();
assert(sections.role && sections.role.length > 0, 'sections.role is non-empty');
assert(sections.voice && sections.voice.length > 0, 'sections.voice is non-empty');
assert(sections.task && sections.task.length > 0, 'sections.task is non-empty');
assert(sections.constraints && sections.constraints.length > 0, 'sections.constraints is non-empty');
assert(sections.tools && sections.tools.length > 0, 'sections.tools is non-empty');
assert(sections.tools.includes('search_web'), 'sections.tools mentions search_web');
assert(sections.tools.includes('join_voice_and_squawk'), 'sections.tools mentions join_voice_and_squawk');
assert(sections.voiceWeights === undefined || typeof sections.voiceWeights === 'string', 'sections.voiceWeights is optional string');
assert(sections.toolVoiceWeights === undefined || typeof sections.toolVoiceWeights === 'string', 'sections.toolVoiceWeights is optional string');

// buildSystemPrompt produces non-empty string
const fullWithTools = parrotConfig.getSystemPromptWithTools();
assert(typeof fullWithTools === 'string' && fullWithTools.length > 0, 'getSystemPromptWithTools() returns non-empty string');

// Phase 3: getToolDescriptions returns object (empty when not from DB)
const toolDescs = parrotConfig.getToolDescriptions();
assert(typeof toolDescs === 'object' && toolDescs !== null, 'getToolDescriptions() returns object');
assert(!Array.isArray(toolDescs), 'getToolDescriptions() is not array');

// Phase 4: model and token limits are getters with fallbacks
assert(typeof parrotConfig.model === 'string' && parrotConfig.model.length > 0, 'parrotConfig.model is non-empty string');
assert(Number.isFinite(parrotConfig.max_completion_tokens) && parrotConfig.max_completion_tokens > 0, 'parrotConfig.max_completion_tokens is positive number');
assert(Number.isFinite(parrotConfig.max_prompt_tokens) && parrotConfig.max_prompt_tokens > 0, 'parrotConfig.max_prompt_tokens is positive number');

// refreshPromptConfig() resolves without throwing (no Supabase = caches cleared; with Supabase = populated)
async function runAsyncChecks() {
    await parrotConfig.refreshPromptConfig();
    // After refresh (no Supabase): getPromptSection('tools') is null, so buildToolsSection fallback is used
    const sectionsAfterRefresh = parrotConfig.getSystemPromptSections();
    assert(sectionsAfterRefresh.tools && sectionsAfterRefresh.tools.length > 0, 'sections.tools still non-empty after refresh (fallback)');
}

runAsyncChecks()
    .then(() => {
        console.log('Parrot prompt test (Phase 1–4): OK');
        console.log('  getTones(): text + vc present');
        console.log('  getSystemPromptSections(): role, voice, task, constraints, tools present');
        console.log('  getSystemPromptWithTools(): length =', fullWithTools.length);
        console.log('  getToolDescriptions():', Object.keys(toolDescs).length, 'keys when from DB, 0 when fallback');
    })
    .catch((err) => {
        console.error('Parrot prompt test failed:', err);
        process.exit(1);
    });
