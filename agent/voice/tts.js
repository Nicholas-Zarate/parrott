/**
 * Text-to-speech for voice channel playback via ElevenLabs API.
 * Generates audio from text, writes to a temp file, returns the path so play.js can play and delete it.
 *
 * Env: ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID (optional; default below).
 * Do not commit API keys; use .env. Rotate the key if it was ever exposed.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const LOG_PREFIX = '[Voice TTS]';

/** Default voice ID when ELEVENLABS_VOICE_ID is not set. */
const DEFAULT_VOICE_ID = 'OLWPpUIhx1M477juiS5T';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
const MODEL_ID = 'eleven_multilingual_v2';

/** Speed for TTS: 1.0 = default, < 1.0 = slower. Override with ELEVENLABS_TTS_SPEED in .env (e.g. 0.85). */
const DEFAULT_TTS_SPEED = 0.85;

/** Appended to every TTS phrase. */
const TTS_ENDING = ' SQUACK NINJAS';

/**
 * Call ElevenLabs text-to-speech, write audio to a temp file, return the path.
 * Response from ElevenLabs is raw binary (application/octet-stream), not JSON.
 *
 * @param {string} text - Text to speak (e.g. "what ninja, squack, bye")
 * @returns {Promise<{ success: true, path: string } | { success: false, error: string }>}
 */
async function generateAudio(text) {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
        return { success: false, error: 'TTS needs some text to speak.' };
    }
    const textToSpeak = trimmed + TTS_ENDING;

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} ELEVENLABS_API_KEY not set`);
        return {
            success: false,
            error: 'TTS not configured. Set ELEVENLABS_API_KEY in .env.',
        };
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
    const speedRaw = process.env.ELEVENLABS_TTS_SPEED;
    const speed = speedRaw != null && speedRaw !== '' ? Math.max(0.5, Math.min(2, Number(speedRaw))) : DEFAULT_TTS_SPEED;
    const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`;
    console.log(`${LOG_PREFIX} generating audio for text="${textToSpeak.slice(0, 60)}${textToSpeak.length > 60 ? '…' : ''}" (voice_id=${voiceId} speed=${speed})`);

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
                model_id: MODEL_ID,
                voice_settings: { speed },
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

    // Response body is raw binary audio (application/octet-stream), not JSON.
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

    console.log(`${LOG_PREFIX} audio ready ${buffer.length} bytes -> ${path.basename(tempPath)}`);
    return { success: true, path: tempPath };
}

module.exports = {
    generateAudio,
};
