/**
 * Voice quick-comment job: runs on an interval; for each active voice session with a recent
 * compressed transcript window, detects voiceChatEvents (e.g. game death, medic). When an event
 * matches and cooldown allows, generates a short one-liner via LLM and plays it in the session.
 *
 * No Discord client dependency — uses session's connection and audioPlayer via playInSession.
 * Run via agent/jobs/scheduler.js.
 */

const { generateText } = require('ai');
const { getModel } = require('../ai-sdk/model-provider');
const parrotConfig = require('../config/parrot');
const { sessionsByGuild } = require('../abilities/voice/session');
const { detectEvents } = require('../abilities/voice/voice-chat-events');
const { playInSession } = require('../abilities/voice/play');

const LOG = '[Voice quick-comment]';
const COOLDOWN_MS = Number(process.env.VOICE_QUICK_COMMENT_COOLDOWN_MS) || 45000;
const MAX_COMMENT_WORDS = 25;

const SYSTEM_PROMPT = [
    'You are a witty parrot in a Discord voice channel. Someone in the game just got shot, downed, killed, or called for a medic.',
    'Reply with exactly one short, funny or supportive line. No tools, no explanation.',
    `Keep it under ${MAX_COMMENT_WORDS} words. Use casual, spoken language suitable for TTS.`,
].join(' ');

/**
 * Generate a short comment for the given event ids and optional transcript snippet.
 * @param {string[]} eventIds - e.g. ['game_death_medic']
 * @param {string} [transcriptSnippet] - Optional compressed transcript for context
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
async function generateQuickComment(eventIds, transcriptSnippet = '') {
    if (!eventIds || eventIds.length === 0) {
        return { success: false, error: 'No events' };
    }
    const modelId = parrotConfig.model;
    const userContent = transcriptSnippet
        ? `Events detected: ${eventIds.join(', ')}. Recent voice: "${transcriptSnippet.slice(0, 300)}". Write one short line.`
        : `Events detected: ${eventIds.join(', ')}. Write one short line.`;
    try {
        const model = getModel(modelId);
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent },
            ],
            maxTokens: 80,
        });
        const text = (result.text || '').trim();
        if (!text) return { success: false, error: 'Empty response' };
        return { success: true, text };
    } catch (err) {
        console.error(`${LOG} LLM error:`, err?.message || err);
        return { success: false, error: err?.message || 'LLM error' };
    }
}

/**
 * Run the quick-comment job: for each active session with a recent window and matching events,
 * generate and play a short comment if cooldown allows.
 * @returns {Promise<{ processed: number, played: number, error?: string }>}
 */
async function runVoiceQuickCommentJob() {
    const sessions = Array.from(sessionsByGuild.values());
    let processed = 0;
    let played = 0;
    const now = Date.now();

    for (const session of sessions) {
        if (!session.listening) continue;
        const window = session.lastCompressedWindow;
        if (!window || !window.text) continue;
        if (now - (session.lastQuickCommentAt || 0) < COOLDOWN_MS) continue;

        const eventIds = detectEvents(window.text);
        if (eventIds.length === 0) continue;

        processed += 1;
        const commentResult = await generateQuickComment(eventIds, window.text);
        if (!commentResult.success || !commentResult.text) {
            continue;
        }

        const playResult = await playInSession(session, commentResult.text, {}, { useQuickCommentModel: true });
        if (playResult.success) {
            session.lastQuickCommentAt = now;
            played += 1;
            console.log(`${LOG} guild ${session.guildId} event ${eventIds[0]} → "${commentResult.text.slice(0, 50)}…"`);
        }
    }

    return { processed, played };
}

module.exports = {
    runVoiceQuickCommentJob,
    generateQuickComment,
    COOLDOWN_MS,
};
