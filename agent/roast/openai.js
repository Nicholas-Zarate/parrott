const roastConfig = require('../config/roast');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

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
    const max_tokens = config.max_tokens ?? roastConfig.max_tokens;

    const body = {
        model,
        max_tokens,
        messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ]
    };

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
 * Map thrown errors from requestRoast to a short user-facing message.
 * @param {Error} err
 * @returns {string}
 */
function getRoastErrorMessage(err) {
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
    return 'Roast request failed. Try again or check logs.';
}

module.exports = { requestRoast, getRoastErrorMessage };
