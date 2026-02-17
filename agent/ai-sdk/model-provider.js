/**
 * Resolve AI SDK model by model id. Uses OpenAI for non-Claude ids, Anthropic for claude-*.
 * Env: OPENAI_API_KEY (OpenAI), ANTHROPIC_API_KEY (Claude).
 *
 * @param {string} [modelId] - e.g. 'gpt-4o', 'claude-sonnet-4-5'. Defaults to OPENAI_MODEL or 'claude-sonnet-4-5'.
 * @returns {import('ai').LanguageModel}
 * @throws {Error} With code NO_OPENAI_API_KEY or NO_ANTHROPIC_API_KEY when the chosen provider's key is missing.
 */

const { openai } = require('@ai-sdk/openai');
const { anthropic } = require('@ai-sdk/anthropic');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'claude-sonnet-4-5';

function isClaudeModel(modelId) {
    const id = (modelId || '').trim().toLowerCase();
    return id.startsWith('claude-') || id.includes('claude-');
}

function getModel(modelId) {
    const resolved = (modelId && String(modelId).trim()) || DEFAULT_MODEL;
    const useClaude = isClaudeModel(resolved);

    if (useClaude) {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey) {
            const err = new Error('Anthropic API key not configured');
            err.code = 'NO_ANTHROPIC_API_KEY';
            throw err;
        }
        return anthropic(resolved);
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
    DEFAULT_MODEL,
};
