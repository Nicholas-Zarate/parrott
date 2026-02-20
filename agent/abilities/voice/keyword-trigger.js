/**
 * Keyword trigger for voice pipeline: "parrott" / "sir parrott".
 * Extracting to a small module so tests can use it without loading the full pipeline (avoids circular deps).
 */

/** Matches "parrot" or "parrott" (or "sir parrot(t)") for direct invocation; capture rest of utterance. */
const PARROTT_TRIGGER_REGEX = /\b(?:sir\s+)?parrott?\b\s*(.*)/is;

/**
 * Extract the part of the utterance after the trigger (for same-utterance input).
 * Strips leading punctuation/whitespace.
 * @param {string} text - Full user utterance
 * @returns {string | null} Remainder after trigger, or null if no trigger; empty string if trigger only
 */
function extractAfterTrigger(text) {
    const m = text.match(PARROTT_TRIGGER_REGEX);
    if (!m) return null;
    return (m[1] || '').trim().replace(/^[\s,;:.-]+/, '').trim();
}

module.exports = {
    PARROTT_TRIGGER_REGEX,
    extractAfterTrigger,
};
