/**
 * Text-to-speech for voice channel playback via ElevenLabs API.
 * Generates audio from text, writes to a temp file, returns the path so play.js can play and delete it.
 *
 * Env: ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID (optional).
 * Optional voice tuning: ELEVENLABS_TTS_SPEED, ELEVENLABS_TTS_STABILITY, ELEVENLABS_TTS_SIMILARITY_BOOST,
 * ELEVENLABS_TTS_STYLE, ELEVENLABS_TTS_SPEAKER_BOOST. See instructions/PLAN_ELEVENLABS_VOICE_SETTINGS.md.
 * Do not commit API keys; use .env.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const LOG_PREFIX = '[Voice TTS]';

/** Default voice ID when ELEVENLABS_VOICE_ID is not set. */
const DEFAULT_VOICE_ID = 'JPJCjRI8jfRp9Aoc5Za9';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
const MODEL_ID = 'eleven_multilingual_v2';
const QUICK_COMMENT_MODEL_ID = process.env.TTS_QUICK_COMMENT_MODEL || 'eleven_flash_v2_5';
/** When TTS_USE_FLASH_FOR_MAIN is set (1/true/yes), use Flash model for main pipeline too (lower latency, slight quality tradeoff). */
const USE_FLASH_FOR_MAIN = /^(1|true|yes)$/i.test(String(process.env.TTS_USE_FLASH_FOR_MAIN || '').trim());

/** Default voice settings: [stability, similarity_boost, style, speaker_boost] → 55, 95, 90, 85 (0–100 scale → 0–1). */
const DEFAULT_STABILITY = 0.55;
const DEFAULT_SIMILARITY_BOOST = 0.95;
const DEFAULT_STYLE = 0.9;
const DEFAULT_SPEAKER_BOOST = true;
const DEFAULT_SPEED = 0.85;

function clamp01(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return undefined;
    return Math.max(0, Math.min(1, n));
}

function clampSpeed(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return undefined;
    return Math.max(0.5, Math.min(2, n));
}

function parseSpeakerBoost(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const s = String(value).trim().toLowerCase();
    if (s === '0' || s === 'false' || s === 'no') return false;
    return true;
}

/**
 * Build default voice_settings from env. Uses DEFAULT_* when env not set or invalid.
 * @returns {{ stability: number, similarity_boost: number, style: number, use_speaker_boost: boolean, speed: number }}
 */
function getDefaultVoiceSettings() {
    const speedRaw = process.env.ELEVENLABS_TTS_SPEED;
    const stabilityRaw = process.env.ELEVENLABS_TTS_STABILITY;
    const similarityRaw = process.env.ELEVENLABS_TTS_SIMILARITY_BOOST;
    const styleRaw = process.env.ELEVENLABS_TTS_STYLE;
    const speakerRaw = process.env.ELEVENLABS_TTS_SPEAKER_BOOST;

    return {
        stability: clamp01(stabilityRaw) ?? DEFAULT_STABILITY,
        similarity_boost: clamp01(similarityRaw) ?? DEFAULT_SIMILARITY_BOOST,
        style: clamp01(styleRaw) ?? DEFAULT_STYLE,
        use_speaker_boost: parseSpeakerBoost(speakerRaw) ?? DEFAULT_SPEAKER_BOOST,
        speed: clampSpeed(speedRaw) ?? DEFAULT_SPEED,
    };
}

/**
 * Derive voice setting overrides from the text that will be spoken (pure, no I/O).
 * Disabled when TTS_DERIVE_SETTINGS_FROM_TEXT is '0', 'false', or 'no'. Otherwise uses length and punctuation.
 * @param {string} text - Phrase that will be spoken (optional configurable ending may be appended)
 * @returns {{ speed?: number, stability?: number }} Partial overrides; only keys that were set. Values clamped to valid ranges.
 */
function deriveVoiceSettingsFromText(text) {
    const disabled = /^(0|false|no)$/i.test(String(process.env.TTS_DERIVE_SETTINGS_FROM_TEXT || '').trim());
    if (disabled) return {};

    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) return {};

    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const lastChar = trimmed.slice(-1);
    const expressivePunctuation = lastChar === '!' || lastChar === '?';

    const out = {};
    if (words >= 1 && words <= 3) {
        out.speed = clampSpeed(1.05) ?? 1.05;
        out.stability = clamp01(0.45) ?? 0.45;
    } else if (words >= 11) {
        out.speed = clampSpeed(0.9) ?? 0.9;
        out.stability = clamp01(0.6) ?? 0.6;
    }
    if (expressivePunctuation && out.stability === undefined) {
        out.stability = clamp01(0.5) ?? 0.5;
    } else if (expressivePunctuation && out.stability !== undefined) {
        out.stability = Math.min(out.stability, 0.5);
    }
    return out;
}

/**
 * Merge per-call overrides onto default voice settings. Overrides are clamped to valid ranges.
 * @param {Object} overrides - Optional { stability?, similarity_boost?, style?, use_speaker_boost?, speed? }
 * @returns {{ stability: number, similarity_boost: number, style: number, use_speaker_boost: boolean, speed: number }}
 */
function mergeVoiceSettings(overrides = {}) {
    const defaults = getDefaultVoiceSettings();
    return {
        stability: overrides.stability !== undefined && overrides.stability !== null
            ? (clamp01(overrides.stability) ?? defaults.stability)
            : defaults.stability,
        similarity_boost: overrides.similarity_boost !== undefined && overrides.similarity_boost !== null
            ? (clamp01(overrides.similarity_boost) ?? defaults.similarity_boost)
            : defaults.similarity_boost,
        style: overrides.style !== undefined && overrides.style !== null
            ? (clamp01(overrides.style) ?? defaults.style)
            : defaults.style,
        use_speaker_boost: overrides.use_speaker_boost !== undefined && overrides.use_speaker_boost !== null
            ? Boolean(overrides.use_speaker_boost)
            : defaults.use_speaker_boost,
        speed: overrides.speed !== undefined && overrides.speed !== null
            ? (clampSpeed(overrides.speed) ?? defaults.speed)
            : defaults.speed,
    };
}

/**
 * Call ElevenLabs text-to-speech, write audio to a temp file, return the path.
 * Response from ElevenLabs is raw binary (application/octet-stream), not JSON.
 *
 * @param {string} text - Text to speak (e.g. "what ninja, squack, bye")
 * @param {Object} [voiceSettingsOverrides] - Optional overrides: stability, similarity_boost, style, use_speaker_boost, speed (merged with env defaults)
 * @param {{ logAsError?: boolean, useQuickCommentModel?: boolean }} [opts] - logAsError: log at error level; useQuickCommentModel: use Flash model for lower latency (e.g. quick-comment job)
 * @returns {Promise<{ success: true, path: string } | { success: false, error: string }>}
 */
async function generateAudio(text, voiceSettingsOverrides = {}, opts = {}) {
    const logAsError = opts.logAsError === true;
    const useQuickCommentModel = opts.useQuickCommentModel === true;
    const logLine = (msg) => (logAsError ? console.error(msg) : console.log(msg));
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
        return { success: false, error: 'TTS needs some text to speak.' };
    }
    const parrotConfig = require('../../config/parrot');
    const ending = parrotConfig.tts_ending;
    const probability = parrotConfig.tts_ending_probability;
    const shouldAppend = typeof ending === 'string' && ending.length > 0 && Math.random() * 100 < probability;
    const textToSpeak = shouldAppend ? trimmed + ending : trimmed;

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} ELEVENLABS_API_KEY not set`);
        return {
            success: false,
            error: 'TTS not configured. Set ELEVENLABS_API_KEY in .env.',
        };
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
    const modelId = useQuickCommentModel ? QUICK_COMMENT_MODEL_ID : (USE_FLASH_FOR_MAIN ? QUICK_COMMENT_MODEL_ID : MODEL_ID);
    const fromText = deriveVoiceSettingsFromText(trimmed);
    const voice_settings = mergeVoiceSettings({ ...fromText, ...voiceSettingsOverrides });
    const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`;
    logLine(`${LOG_PREFIX} generating audio for text="${textToSpeak.slice(0, 60)}${textToSpeak.length > 60 ? '…' : ''}" (model=${modelId} voice_id=${voiceId} stability=${voice_settings.stability} similarity=${voice_settings.similarity_boost} style=${voice_settings.style} speaker_boost=${voice_settings.use_speaker_boost} speed=${voice_settings.speed})`);

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text: textToSpeak,
                model_id: modelId,
                voice_settings: {
                    stability: voice_settings.stability,
                    similarity_boost: voice_settings.similarity_boost,
                    style: voice_settings.style,
                    use_speaker_boost: voice_settings.use_speaker_boost,
                    speed: voice_settings.speed,
                },
            }),
        });
    } catch (err) {
        console.error(`${LOG_PREFIX} fetch error:`, err?.message || err);
        return { success: false, error: err?.message || 'Failed to call TTS API.' };
    }

    if (!res.ok) {
        let errMsg = `TTS API error: ${res.status}`;
        try {
            const body = await res.text();
            const parsed = JSON.parse(body);
            const d = parsed.detail;
            errMsg = (typeof d === 'string' ? d : d?.message) || parsed.message || errMsg;
        } catch (_) {
            /* ignore */
        }
        console.error(`${LOG_PREFIX} ${errMsg}`);
        return { success: false, error: errMsg };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    if (buffer.length === 0) {
        console.log(`${LOG_PREFIX} API returned empty audio`);
        return { success: false, error: 'TTS returned no audio.' };
    }

    const tempPath = path.join(os.tmpdir(), `parrott-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
    try {
        fs.writeFileSync(tempPath, buffer);
    } catch (err) {
        console.error(`${LOG_PREFIX} write temp file error:`, err?.message || err);
        return { success: false, error: err?.message || 'Failed to write audio file.' };
    }

    logLine(`${LOG_PREFIX} audio ready ${buffer.length} bytes -> ${path.basename(tempPath)}`);
    return { success: true, path: tempPath };
}

module.exports = {
    generateAudio,
    getDefaultVoiceSettings,
    mergeVoiceSettings,
    deriveVoiceSettingsFromText,
};
