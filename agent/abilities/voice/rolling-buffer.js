/**
 * Rolling window of voice transcript for the quick-comment job.
 * We keep the last N seconds of utterances per session and produce a compressed text window.
 * Used by the pipeline after each STT and read by the voice-quick-comment job.
 */

const ROLLING_WINDOW_MS = 5000;

/**
 * Append a transcribed utterance to the session's rolling window and update lastCompressedWindow.
 * Call this after each user utterance is transcribed.
 * @param {object} session - VoiceSession (must have recentUtterances, lastCompressedWindow)
 * @param {string} text - Transcribed text for this utterance
 */
function appendAndCompress(session, text) {
    if (!session || !text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!Array.isArray(session.recentUtterances)) {
        session.recentUtterances = [];
    }
    const now = Date.now();
    session.recentUtterances.push({ text: trimmed, endTs: now });

    const cutoff = now - ROLLING_WINDOW_MS;
    session.recentUtterances = session.recentUtterances.filter((u) => u.endTs > cutoff);

    const combined = session.recentUtterances.map((u) => u.text).join(' ').trim();
    session.lastCompressedWindow = combined ? { text: combined, ts: now } : null;
}

module.exports = {
    appendAndCompress,
    ROLLING_WINDOW_MS,
};
