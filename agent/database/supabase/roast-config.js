/**
 * Fetch roast config from Supabase (parrot_roast_config table).
 * Keys: roast_weight_messages, roast_weight_game_streak, roast_weight_custom, roast_game_streak_min_activities.
 */

const { getClient } = require('./client');

const TABLE = 'parrot_roast_config';

const DEFAULT_WEIGHTS = {
    weight_messages: 60,
    weight_game_streak: 10,
    weight_custom: 30,
    game_streak_min_activities: 5,
};

/**
 * Fetch roast config and return weights + game_streak_min_activities.
 * @returns {Promise<{ weight_messages: number, weight_game_streak: number, weight_custom: number, game_streak_min_activities: number } | null>}
 */
async function getRoastConfigFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('key, value_int');

    if (error) {
        console.error('[Roast config] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const out = { ...DEFAULT_WEIGHTS };
    for (const row of data) {
        const k = row.key?.trim();
        if (!k) continue;
        const v = row.value_int;
        if (k === 'roast_weight_messages' && v != null && Number.isFinite(Number(v))) out.weight_messages = Math.max(0, Math.min(100, Number(v)));
        if (k === 'roast_weight_game_streak' && v != null && Number.isFinite(Number(v))) out.weight_game_streak = Math.max(0, Math.min(100, Number(v)));
        if (k === 'roast_weight_custom' && v != null && Number.isFinite(Number(v))) out.weight_custom = Math.max(0, Math.min(100, Number(v)));
        if (k === 'roast_game_streak_min_activities' && v != null && Number.isInteger(Number(v)) && Number(v) >= 0) out.game_streak_min_activities = Number(v);
    }

    return out;
}

module.exports = {
    getRoastConfigFromSupabase,
    DEFAULT_WEIGHTS,
};
