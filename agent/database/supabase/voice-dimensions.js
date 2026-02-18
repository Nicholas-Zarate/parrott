/**
 * Fetch voice dimension weights (0-100) from Supabase (parrot_voice_dimensions).
 * Used to build voiceWeights and toolVoiceWeights lines injected into the system prompt.
 * Load whenever Supabase is configured, independent of PARROT_TONES_SOURCE.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_voice_dimensions';

/** Allowed scope values; ignore unknown rows. */
const SCOPES = ['global', 'tools'];

/**
 * Clamp value to 0-100. Defensive; DB CHECK should already enforce.
 * @param {number} n
 * @returns {number}
 */
function clamp(n) {
    if (n == null || !Number.isFinite(Number(n))) return 0;
    const v = Number(n);
    if (v < 0) return 0;
    if (v > 100) return 100;
    return Math.round(v);
}

/**
 * Build a single "tone weights" sentence from five dimension values.
 * Returns empty string if dimensions are missing or all zeros (so we don't tell the model "prioritize zero on everything").
 * @param {{ snarky?: number, chill?: number, witty?: number, sarcastic?: number, sassy?: number } | null | undefined} dimensions
 * @returns {string}
 */
function buildWeightsLine(dimensions) {
    if (!dimensions || typeof dimensions !== 'object') return '';
    const s = clamp(dimensions.snarky);
    const c = clamp(dimensions.chill);
    const w = clamp(dimensions.witty);
    const sarc = clamp(dimensions.sarcastic);
    const sass = clamp(dimensions.sassy);
    const anyNonZero = s > 0 || c > 0 || w > 0 || sarc > 0 || sass > 0;
    if (!anyNonZero) return '';
    return `Tone weights (0-100): snarky ${s}, chill ${c}, witty ${w}, sarcastic ${sarc}, sassy ${sass}. Prioritize these when balancing your tone.`;
}

/**
 * Fetch all rows from parrot_voice_dimensions and return keyed by scope.
 * @returns {Promise<{ [scope: string]: { snarky: number, chill: number, witty: number, sarcastic: number, sassy: number } }>}
 */
async function getVoiceDimensionsFromSupabase() {
    const supabase = getClient();
    if (!supabase) return {};

    const { data, error } = await supabase
        .from(TABLE)
        .select('scope, snarky, chill, witty, sarcastic, sassy');

    if (error) {
        const missingTable = /schema cache|relation .* does not exist|could not find the table/i.test(error.message);
        if (missingTable) {
            console.warn('[Voice dimensions] Table parrot_voice_dimensions not found. Run migration 030_ensure_parrot_voice_dimensions.sql in Supabase SQL Editor.');
        } else {
            console.error('[Voice dimensions] Supabase error:', error.message);
        }
        return {};
    }

    if (!Array.isArray(data) || data.length === 0) return {};

    const byScope = {};
    for (const row of data) {
        const scope = row.scope?.trim();
        if (!scope || !SCOPES.includes(scope)) continue;
        byScope[scope] = {
            snarky: clamp(row.snarky),
            chill: clamp(row.chill),
            witty: clamp(row.witty),
            sarcastic: clamp(row.sarcastic),
            sassy: clamp(row.sassy),
        };
    }

    return byScope;
}

module.exports = {
    SCOPES,
    buildWeightsLine,
    getVoiceDimensionsFromSupabase,
};
