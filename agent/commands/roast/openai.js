/**
 * Roast and generic chat via AI SDK (OpenAI or Anthropic via model-provider).
 * requestRoast / requestChat use getModel() so they respect the same model switch as the rest of the app.
 */

const { generateText } = require('ai');
const { getModel } = require('../../ai-sdk/model-provider');
const roastConfig = require('../../config/roast');

/**
 * Resolve system prompt from config: use string, sections+order, systemPromptParts, or fall back to default.
 * @param {Object} config - Caller config (may override)
 * @param {Object} defaults - Default config (roastConfig)
 * @returns {string}
 */
function resolveSystemPrompt(config, defaults) {
    if (typeof config.systemPrompt === 'string' && config.systemPrompt.trim()) {
        return config.systemPrompt;
    }
    if (config.systemPromptSections && typeof config.systemPromptSections === 'object') {
        const order = Array.isArray(config.systemPromptOrder) && config.systemPromptOrder.length
            ? config.systemPromptOrder
            : (defaults.systemPromptOrder || Object.keys(config.systemPromptSections));
        const parts = order.map((key) => config.systemPromptSections[key]).filter(Boolean);
        if (parts.length) return parts.join(' ');
    }
    if (Array.isArray(config.systemPromptParts) && config.systemPromptParts.length) {
        return config.systemPromptParts.join(' ');
    }
    return defaults.systemPrompt;
}

/**
 * Normalize errors from getModel() or generateText() to the contract callers expect (err.code, err.status).
 * Re-throws so getOpenAIErrorMessage() and handlers work unchanged.
 * @param {Error} err
 * @throws {Error} With code and optionally status set.
 */
function normalizeProviderError(err) {
    if (err.code === 'NO_OPENAI_API_KEY' || err.code === 'NO_ANTHROPIC_API_KEY' || err.code === 'NO_XAI_API_KEY') {
        throw err;
    }
    const msg = (err.message || '').toLowerCase();
    const status = err.status ?? (err.cause && err.cause.status) ?? (err.response && err.response.status);
    if (status === 401 || msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
        const e = new Error(err.message || 'Unauthorized');
        e.code = 'UNAUTHORIZED';
        e.status = 401;
        e.cause = err;
        throw e;
    }
    if (status === 429 || msg.includes('429') || msg.includes('rate limit')) {
        const e = new Error(err.message || 'Rate limit');
        e.code = 'RATE_LIMIT';
        e.status = 429;
        e.cause = err;
        throw e;
    }
    if (status >= 500 || (typeof status === 'number' && status >= 500)) {
        const e = new Error(err.message || 'Server error');
        e.code = 'API_ERROR';
        e.status = status;
        e.cause = err;
        throw e;
    }
    const e = new Error(err.message || 'API error');
    e.code = 'API_ERROR';
    e.status = status;
    e.cause = err;
    throw e;
}

/**
 * Call LLM (via AI SDK) for roast prompt and user data.
 * @param {string} userDataText - Formatted user block (from formatUserDataForLLM).
 * @param {Object} [config] - Override config (default: config/roast.js).
 * @returns {Promise<{ content: string }>}
 * @throws {Error} With code suitable for getRoastErrorMessage() / getOpenAIErrorMessage().
 */
async function requestRoast(userDataText, config = roastConfig) {
    const modelId = config.model ?? roastConfig.model;
    console.log('[Roast] requestRoast using model "%s"', modelId);
    const userContent = (config.userPromptTemplate || roastConfig.userPromptTemplate)
        .replace(/\{\{USER_DATA\}\}/g, userDataText);
    const systemContent = resolveSystemPrompt(config, roastConfig);
    const messages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
    ];
    const maxTokens = config.max_completion_tokens ?? config.max_tokens ?? roastConfig.max_completion_tokens ?? roastConfig.max_tokens ?? 100;

    try {
        const model = getModel(modelId);
        const result = await generateText({
            model,
            messages,
            maxTokens,
        });
        const content = (result.text || '').trim();
        return { content };
    } catch (err) {
        normalizeProviderError(err);
    }
}

/**
 * Generic chat completions via AI SDK (same provider resolution as requestRoast).
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages
 * @param {{ model?: string, max_tokens?: number, max_completion_tokens?: number }} [options] - Defaults from roastConfig
 * @returns {Promise<{ content: string }>}
 * @throws {Error} Same codes as requestRoast; use getOpenAIErrorMessage() for user-facing text.
 */
async function requestChat(messages, options = {}) {
    const modelId = options.model ?? roastConfig.model;
    const maxTokens = options.max_completion_tokens ?? options.max_tokens ?? roastConfig.max_completion_tokens ?? roastConfig.max_tokens ?? 100;

    try {
        const model = getModel(modelId);
        const result = await generateText({
            model,
            messages,
            maxTokens,
        });
        const content = (result.text || '').trim();
        return { content };
    } catch (err) {
        normalizeProviderError(err);
    }
}

/**
 * Map thrown errors from requestRoast or requestChat to a short user-facing message.
 * @param {Error} err
 * @returns {string}
 */
function getOpenAIErrorMessage(err) {
    if (err.code === 'NO_API_KEY' || err.code === 'NO_OPENAI_API_KEY') {
        return 'OpenAI API key not configured. Set OPENAI_API_KEY in your environment or .env.';
    }
    if (err.code === 'NO_ANTHROPIC_API_KEY') {
        return 'Anthropic API key not configured. Set ANTHROPIC_API_KEY in your environment or .env.';
    }
    if (err.code === 'NO_XAI_API_KEY') {
        return 'xAI API key not configured. Set XAI_API_KEY in your environment or .env.';
    }
    if (err.code === 'UNAUTHORIZED' || err.status === 401) {
        return 'Invalid API key. Check OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY for the selected model.';
    }
    if (err.code === 'RATE_LIMIT' || err.status === 429) {
        return 'Rate limit; try again in a moment.';
    }
    if (err.status >= 500) {
        return 'Request failed; try again later.';
    }
    return 'Something went wrong. Try again or check logs.';
}

/**
 * @deprecated Use getOpenAIErrorMessage for new code. Kept for backward compatibility with roast.
 */
function getRoastErrorMessage(err) {
    return getOpenAIErrorMessage(err);
}

module.exports = { requestRoast, requestChat, getRoastErrorMessage, getOpenAIErrorMessage, normalizeProviderError };
