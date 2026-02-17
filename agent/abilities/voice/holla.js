/**
 * Generate a "holla at me" response: short greeting or (on small occasions) a game-based line.
 * Used when the user says "holla at me" and the VC tool is invoked with no phrase to repeat.
 *
 * Uses AI SDK + model-provider (env: OPENAI_MODEL or gpt-4o-mini for voice). Falls back to FALLBACK_PHRASE on failure.
 */

const { generateText } = require('ai');
const { getModel } = require('../../ai-sdk/model-provider');
const { getMostCommonGameInVoiceChannel } = require('./getGameInChannel');
const { generateGameRoast, FALLBACK_PHRASE } = require('./gameRoast');

const LOG_PREFIX = '[Voice holla]';
const VOICE_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** Probability (0–1) that we use a game-based line when a game is present in VC. */
const GAME_LINE_CHANCE = 0.2;

const GREETING_SYSTEM = 'You are a casual, friendly parrot. Reply with exactly one short greeting (under 15 words). Warm and light; no slang or snark. No quotes, no explanation.';
const GREETING_USER = 'Someone just said "holla at me" in the voice channel. Say one short friendly greeting to them.';

/**
 * Generate one short hood-parrot greeting via AI SDK.
 * @returns {Promise<string>}
 */
async function generateGreeting() {
    try {
        const model = getModel(VOICE_MODEL);
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: GREETING_SYSTEM },
                { role: 'user', content: GREETING_USER }
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

/**
 * Generate the line to speak for "holla at me": greeting most of the time, or on small occasions a game-based line.
 *
 * @param {import('discord.js').VoiceChannel} voiceChannel - Channel to check for game activity
 * @param {string} [botUserId] - Bot user ID to exclude from game detection
 * @returns {Promise<string>}
 */
async function generateHollaResponse(voiceChannel, botUserId) {
    const game = getMostCommonGameInVoiceChannel(voiceChannel, botUserId);
    if (game && Math.random() < GAME_LINE_CHANCE) {
        console.log(`${LOG_PREFIX} using game line for "${game}"`);
        return generateGameRoast(game);
    }
    return generateGreeting();
}

module.exports = {
    generateGreeting,
    generateHollaResponse,
    FALLBACK_PHRASE,
};
