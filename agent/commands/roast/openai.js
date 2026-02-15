const roastConfig = require('../../config/roast');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Build the request body for chat completions. Uses max_completion_tokens when provided (required for gpt-5.2 / o-series), else max_tokens for older models.
 * @param {string} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ max_tokens?: number, max_completion_tokens?: number }} tokenOptions
 * @returns {Object}
 */
function buildChatBody(model, messages, tokenOptions = {}) {
    const body = { model, messages };
    if (tokenOptions.max_completion_tokens != null) {
        body.max_completion_tokens = tokenOptions.max_completion_tokens;
    } else if (tokenOptions.max_tokens != null) {
        body.max_tokens = tokenOptions.max_tokens;
    }
    return body;
}

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
 * Call OpenAI Chat Completions with the roast prompt and user data.
 * @param {string} userDataText - Formatted user block (from formatUserDataForLLM).
 * @param {Object} [config] - Override config (default: config/roast.js).
 * @returns {Promise<{ content: string }>}
 * @throws {Error} With message suitable for logging; use getRoastErrorMessage() for user-facing text.
 */
async function requestRoast(userDataText, config = roastConfig) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        const err = new Error('OpenAI API key not configured');
        err.code = 'NO_API_KEY';
        throw err;
    }

    const userContent = (config.userPromptTemplate || roastConfig.userPromptTemplate)
        .replace(/\{\{USER_DATA\}\}/g, userDataText);
    const systemContent = resolveSystemPrompt(config, roastConfig);
    const model = config.model ?? roastConfig.model;
    const messages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
    ];
    const tokenOptions = {
        max_completion_tokens: config.max_completion_tokens ?? roastConfig.max_completion_tokens,
        max_tokens: config.max_tokens ?? roastConfig.max_tokens
    };
    const body = buildChatBody(model, messages, tokenOptions);

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.code = res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMIT' : 'API_ERROR';
        let detail = '';
        try {
            const data = await res.json();
            detail = data.error?.message || JSON.stringify(data);
        } catch (_) {
            detail = await res.text();
        }
        err.detail = detail;
        throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
        const err = new Error('OpenAI returned no content');
        err.detail = JSON.stringify(data);
        throw err;
    }
    return { content: content.trim() };
}

/**
 * Generic OpenAI Chat Completions call. Use for mention replies or any non-roast chat.
 * For gpt-5.2 / o-series use max_completion_tokens; for older models use max_tokens.
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages
 * @param {{ model?: string, max_tokens?: number, max_completion_tokens?: number }} [options] - Defaults from roastConfig
 * @returns {Promise<{ content: string }>}
 * @throws {Error} Same codes as requestRoast; use getOpenAIErrorMessage() for user-facing text.
 */
async function requestChat(messages, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        const err = new Error('OpenAI API key not configured');
        err.code = 'NO_API_KEY';
        throw err;
    }
    const model = options.model ?? roastConfig.model;
    const tokenOptions = {
        max_completion_tokens: options.max_completion_tokens ?? roastConfig.max_completion_tokens,
        max_tokens: options.max_tokens ?? roastConfig.max_tokens
    };
    const body = buildChatBody(model, messages, tokenOptions);

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.code = res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMIT' : 'API_ERROR';
        let detail = '';
        try {
            const data = await res.json();
            detail = data.error?.message || JSON.stringify(data);
        } catch (_) {
            detail = await res.text();
        }
        err.detail = detail;
        throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
        const err = new Error('OpenAI returned no content');
        err.detail = JSON.stringify(data);
        throw err;
    }
    return { content: content.trim() };
}

/**
 * Map thrown errors from requestRoast or requestChat to a short user-facing message.
 * @param {Error} err
 * @returns {string}
 */
function getOpenAIErrorMessage(err) {
    if (err.code === 'NO_API_KEY') {
        return 'OpenAI API key not configured. Set OPENAI_API_KEY in your environment or .env.';
    }
    if (err.code === 'UNAUTHORIZED' || err.status === 401) {
        return 'Invalid OpenAI API key. Check OPENAI_API_KEY.';
    }
    if (err.code === 'RATE_LIMIT' || err.status === 429) {
        return 'OpenAI rate limit; try again in a moment.';
    }
    if (err.status >= 500) {
        return 'OpenAI request failed; try again later.';
    }
    return 'Something went wrong. Try again or check logs.';
}

/**
 * @deprecated Use getOpenAIErrorMessage for new code. Kept for backward compatibility with roast.
 */
function getRoastErrorMessage(err) {
    return getOpenAIErrorMessage(err);
}

module.exports = { requestRoast, requestChat, getRoastErrorMessage, getOpenAIErrorMessage };
