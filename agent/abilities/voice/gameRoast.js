/**
 * Generate a short, light comment about the game people are playing in VC.
 * Used when the voice tool runs in "holla" mode (no custom "say: ..." message) and we occasionally mention the game.
 *
 * Env: OPENAI_API_KEY. On failure or no game, returns a safe fallback phrase.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const LOG_PREFIX = '[Voice gameRoast]';

/** Fallback when no game is found or OpenAI fails. */
const FALLBACK_PHRASE = 'Hey everyone, okay bye!';

const SYSTEM_PROMPT = 'You are a friendly parrot. Reply with exactly one short sentence (under 15 words). Light, playful comment—no roast or put-down. No quotes, no explanation.';
const USER_PROMPT_TEMPLATE = 'Everyone in the voice channel is playing "{{GAME}}". Say one short, friendly line about it (no roast, no snark).';

/**
 * Call OpenAI to generate one short roast line about the game. On any failure, return fallback.
 *
 * @param {string} gameName - Game/activity name (e.g. "League of Legends")
 * @returns {Promise<string>} One short roast line, or FALLBACK_PHRASE on error
 */
async function generateGameRoast(gameName) {
    const trimmed = typeof gameName === 'string' ? gameName.trim() : '';
    if (!trimmed) {
        return FALLBACK_PHRASE;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} OPENAI_API_KEY not set, using fallback`);
        return FALLBACK_PHRASE;
    }

    const userContent = USER_PROMPT_TEMPLATE.replace(/\{\{GAME\}\}/g, trimmed);
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
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
        if (line.length > 0) {
            return line.slice(0, 200);
        }
        return FALLBACK_PHRASE;
    } catch (err) {
        console.error(`${LOG_PREFIX} error:`, err?.message || err);
        return FALLBACK_PHRASE;
    }
}

module.exports = {
    generateGameRoast,
    FALLBACK_PHRASE,
};
