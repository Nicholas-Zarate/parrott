/**
 * Generate a "holla at me" response: short greeting or (on small occasions) a game-based line.
 * Used when the user says "holla at me" and the VC tool is invoked with no phrase to repeat.
 *
 * Env: OPENAI_API_KEY. Falls back to FALLBACK_PHRASE on failure.
 */

const { getMostCommonGameInVoiceChannel } = require('./getGameInChannel');
const { generateGameRoast, FALLBACK_PHRASE } = require('./gameRoast');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const LOG_PREFIX = '[Voice holla]';

/** Probability (0–1) that we use a game-based line when a game is present in VC. */
const GAME_LINE_CHANCE = 0.2;

const GREETING_SYSTEM = 'You are a casual, friendly parrot. Reply with exactly one short greeting (under 15 words). Warm and light; no slang or snark. No quotes, no explanation.';
const GREETING_USER = 'Someone just said "holla at me" in the voice channel. Say one short friendly greeting to them.';

/**
 * Generate one short hood-parrot greeting via OpenAI.
 * @returns {Promise<string>}
 */
async function generateGreeting() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} OPENAI_API_KEY not set, using fallback`);
        return FALLBACK_PHRASE;
    }
    const messages = [
        { role: 'system', content: GREETING_SYSTEM },
        { role: 'user', content: GREETING_USER }
    ];
    const body = {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        max_completion_tokens: 40
    };
    try {
        const res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`${LOG_PREFIX} OpenAI ${res.status}:`, errText.slice(0, 200));
            return FALLBACK_PHRASE;
        }
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const line = (content && typeof content === 'string') ? content.trim() : '';
        if (line.length > 0) return line.slice(0, 200);
        return FALLBACK_PHRASE;
    } catch (err) {
        console.error(`${LOG_PREFIX} error:`, err?.message || err);
        return FALLBACK_PHRASE;
    }
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
