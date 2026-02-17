/**
 * Generate a short, light comment about the game people are playing in VC.
 * Used when the voice tool runs in "holla" mode (no custom "say: ..." message) and we occasionally mention the game.
 *
 * Uses AI SDK + model-provider (env: OPENAI_MODEL or gpt-4o-mini). On failure or no game, returns a safe fallback phrase.
 */

const { generateText } = require('ai');
const { getModel } = require('../../ai-sdk/model-provider');

const LOG_PREFIX = '[Voice gameRoast]';
const VOICE_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** Fallback when no game is found or LLM fails. */
const FALLBACK_PHRASE = 'Hey everyone, okay bye!';

const SYSTEM_PROMPT = 'You are a friendly parrot. Reply with exactly one short sentence (under 15 words). Light, playful comment—no roast or put-down. No quotes, no explanation.';
const USER_PROMPT_TEMPLATE = 'Everyone in the voice channel is playing "{{GAME}}". Say one short, friendly line about it (no roast, no snark).';

/**
 * Call LLM to generate one short line about the game. On any failure, return fallback.
 *
 * @param {string} gameName - Game/activity name (e.g. "League of Legends")
 * @returns {Promise<string>} One short line, or FALLBACK_PHRASE on error
 */
async function generateGameRoast(gameName) {
    const trimmed = typeof gameName === 'string' ? gameName.trim() : '';
    if (!trimmed) {
        return FALLBACK_PHRASE;
    }

    try {
        const model = getModel(VOICE_MODEL);
        const userContent = USER_PROMPT_TEMPLATE.replace(/\{\{GAME\}\}/g, trimmed);
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent }
            ],
            maxTokens: 40,
        });
        const line = (result.text && typeof result.text === 'string') ? result.text.trim() : '';
        if (line.length > 0) return line.slice(0, 200);
    } catch (err) {
        console.error(`${LOG_PREFIX} error:`, err?.message || err);
    }
    return FALLBACK_PHRASE;
}

module.exports = {
    generateGameRoast,
    FALLBACK_PHRASE,
};
