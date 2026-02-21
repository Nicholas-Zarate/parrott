/**
 * Fetch runtime config from Supabase (parrot_runtime_config table).
 * Key-value: model, voice_model, tts_ending (value_text); max_completion_tokens, max_prompt_tokens, tts_ending_probability (value_int).
 */

const { getClient } = require('./client');

const TABLE = 'parrot_runtime_config';

/**
 * Fetch all rows and return { model?, voice_model?, max_completion_tokens?, max_prompt_tokens?, tts_ending?, tts_ending_probability? }.
 * tts_ending: raw value_text (empty string = do not append). tts_ending_probability: 0-100.
 * @returns {Promise<{ model?: string, voice_model?: string, max_completion_tokens?: number, max_prompt_tokens?: number, tts_ending?: string, tts_ending_probability?: number } | null>}
 */
async function getRuntimeConfigFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select('key, value_text, value_int');

    if (error) {
        console.error('[Runtime config] Supabase error:', error.message);
        return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    const config = {};
    for (const row of data) {
        const k = row.key?.trim();
        if (!k) continue;
        if (k === 'model' && row.value_text != null) config.model = String(row.value_text).trim() || undefined;
        if (k === 'voice_model' && row.value_text != null) config.voice_model = String(row.value_text).trim() || undefined;
        if (k === 'max_completion_tokens' && row.value_int != null) config.max_completion_tokens = Number(row.value_int);
        if (k === 'max_prompt_tokens' && row.value_int != null) config.max_prompt_tokens = Number(row.value_int);
        if (k === 'tts_ending') config.tts_ending = row.value_text != null ? String(row.value_text) : undefined;
       if ( k === 'tts_ending_probability' && row.value_int != null) config.tts_ending_probability = Number(row.value_int);
    }

    return config;
}

module.exports = {
    getRuntimeConfigFromSupabase,
};
