/**
 * Resolve AI SDK model by model id. Provider is chosen by explicit prefix match:
 *   - claude-*  → Anthropic
 *   - grok-*    → xAI (Grok)
 *   - else      → OpenAI
 * Env: OPENAI_API_KEY (OpenAI), ANTHROPIC_API_KEY (Claude), XAI_API_KEY (Grok).
 *
 * @param {string} [modelId] - e.g. 'gpt-4o', 'claude-sonnet-4-5', 'grok-3'. Defaults to OPENAI_MODEL or 'claude-sonnet-4-5'.
 * @returns {import('ai').LanguageModel}
 * @throws {Error} With code NO_OPENAI_API_KEY, NO_ANTHROPIC_API_KEY, or NO_XAI_API_KEY when the chosen provider's key is missing.
 */

const { openai } = require('@ai-sdk/openai');
const { anthropic } = require('@ai-sdk/anthropic');
const { xai } = require('@ai-sdk/xai');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'claude-sonnet-4-5';

/** Incremented on each getModel() call; used to log current model every 3 calls. */
let getModelCallCount = 0;

/** Explicit match: Anthropic Claude model ids start with or contain "claude-" (e.g. claude-sonnet-4-5). */
function isClaudeModel(modelId) {
    const id = (modelId || '').trim().toLowerCase();
    return id.startsWith('claude-') || id.includes('claude-');
}

/** Explicit match: xAI Grok model ids start with "grok-" per xAI docs (e.g. grok-3, grok-3-mini, grok-4-0709). */
function isGrokModel(modelId) {
    const id = (modelId || '').trim().toLowerCase();
    return id.startsWith('grok-');
}

function getModel(modelId) {
    const resolved = (modelId && String(modelId).trim()) || DEFAULT_MODEL;

    getModelCallCount += 1;
    if (getModelCallCount % 3 === 1) {
        console.log('[Model] current model (every 3rd call):', resolved);
    }

    if (isClaudeModel(resolved)) {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey) {
            const err = new Error('Anthropic API key not configured');
            err.code = 'NO_ANTHROPIC_API_KEY';
            throw err;
        }
        return anthropic(resolved);
    }

    if (isGrokModel(resolved)) {
        const apiKey = process.env.XAI_API_KEY?.trim();
        if (!apiKey) {
            const err = new Error('xAI API key not configured');
            err.code = 'NO_XAI_API_KEY';
            throw err;
        }
        return xai(resolved);
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        const err = new Error('OpenAI API key not configured');
        err.code = 'NO_OPENAI_API_KEY';
        throw err;
    }
    return openai(resolved);
}

module.exports = {
    getModel,
    isClaudeModel,
    isGrokModel,
    DEFAULT_MODEL,
};
