/**
 * Voice chat events: configurable list of events we detect in voice transcript (e.g. game death, medic).
 * Used by the quick-comment job to decide when to produce a short TTS response.
 * v1: single event — someone got shot, dead, downed, killed, blown up, or calling for medic/defib.
 */

const LOG_PREFIX = '[Voice chat events]';

/**
 * Event definitions: id, human-readable name, and keyword/regex rules for detection.
 * Add more entries to expand detection.
 */
const VOICE_CHAT_EVENTS = [
    {
        id: 'game_death_medic',
        name: 'Someone got shot, dead, downed, killed, blown up, or is calling for medic/defib',
        keywords: [
            'shot', 'dead', 'downed', 'killed', 'blown up', 'medic', 'defib', 'defib me',
            "i'm down", 'im down', 'got shot', 'need medic', 'need a medic', 'revive',
            'rez me', 'res me', 'bleed out', 'knocked', 'eliminated', 'eliminated me',
        ],
        /** Case-insensitive regex built from keywords (word boundaries where sensible). */
        pattern: null, // built lazily below
    },
];

// Build regex for each event (word-boundary style for whole words where possible)
for (const ev of VOICE_CHAT_EVENTS) {
    const parts = ev.keywords.map((k) => {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${escaped}\\b`;
    });
    try {
        ev.pattern = new RegExp(parts.join('|'), 'i');
    } catch (e) {
        console.error(`${LOG_PREFIX} failed to build pattern for ${ev.id}:`, e?.message);
        ev.pattern = /(?!)/; // never matches
    }
}

/**
 * Detect which voice chat events are present in the given (compressed) text.
 * @param {string} compressedText - Text to scan (e.g. from last 5s window).
 * @returns {string[]} Array of event ids that matched.
 */
function detectEvents(compressedText) {
    if (!compressedText || typeof compressedText !== 'string') return [];
    const trimmed = compressedText.trim();
    if (!trimmed) return [];
    const matched = [];
    for (const ev of VOICE_CHAT_EVENTS) {
        if (ev.pattern && ev.pattern.test(trimmed)) {
            matched.push(ev.id);
        }
    }
    return matched;
}

/**
 * Get the list of event definitions (read-only).
 * @returns {{ id: string, name: string }[]}
 */
function getVoiceChatEvents() {
    return VOICE_CHAT_EVENTS.map((e) => ({ id: e.id, name: e.name }));
}

module.exports = {
    VOICE_CHAT_EVENTS,
    detectEvents,
    getVoiceChatEvents,
};
