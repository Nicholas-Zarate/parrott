/**
 * Speech-to-text via OpenAI Whisper API. Used by the voice session pipeline.
 * Env: OPENAI_API_KEY.
 *
 * Call transcribeFromFile(audioFilePath) after writing received audio to a file
 * (e.g. Opus stream piped through ffmpeg to WAV/MP3).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_PREFIX = '[Voice STT]';

const WHISPER_API = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';

/**
 * Transcribe an audio file using OpenAI Whisper.
 * @param {string} filePath - Absolute path to an audio file (e.g. .wav, .mp3). Whisper accepts mp3, mp4, mpeg, mpga, m4a, wav, webm.
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
async function transcribeFromFile(filePath) {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
        console.log(`${LOG_PREFIX} OPENAI_API_KEY not set`);
        return { success: false, error: 'OpenAI API key not configured.' };
    }
    if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'Audio file not found.' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
        return { success: false, error: 'Audio file is empty.' };
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'application/octet-stream';
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], { type: mime });
    const formData = new FormData();
    formData.append('file', blob, path.basename(filePath));
    formData.append('model', MODEL);

    try {
        const response = await fetch(WHISPER_API, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
            },
            body: formData,
        });
        if (!response.ok) {
            const errBody = await response.text();
            console.error(`${LOG_PREFIX} Whisper API error ${response.status}:`, errBody?.slice(0, 200));
            return { success: false, error: `Whisper API error: ${response.status}` };
        }
        const data = await response.json();
        const text = (data?.text ?? '').trim();
        return { success: true, text };
    } catch (err) {
        console.error(`${LOG_PREFIX} transcribe error:`, err?.message || err);
        return { success: false, error: err?.message || 'Transcription failed.' };
    }
}

/**
 * Write an Opus or PCM stream to a temp file using ffmpeg (so Whisper can read it).
 * Caller should pass a readable stream; ffmpeg will be used if format is not natively supported by Whisper.
 * @param {import('stream').Readable} audioStream - Readable stream (e.g. from receiver.subscribe)
 * @param {{ format?: string }} [options] - format: 'opus' (default) or 'pcm'
 * @returns {Promise<{ path: string, cleanup: () => void }>} Temp file path and cleanup function
 */
async function streamToTempFile(audioStream, options = {}) {
    const format = options.format || 'opus';
    const ext = format === 'pcm' ? 'raw' : 'opus';
    const tempPath = path.join(os.tmpdir(), `parrott-stt-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext === 'raw' ? 'wav' : 'ogg'}`);
    const cleanup = () => {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) { /* ignore */ }
    };

    const { spawn } = require('child_process');
    const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
    const args = format === 'opus'
        ? ['-f', 'opus', '-i', 'pipe:0', '-acodec', 'libmp3lame', '-f', 'mp3', tempPath]
        : ['-f', 's16le', '-ar', '48000', '-ac', '1', '-i', 'pipe:0', '-acodec', 'pcm_s16le', '-ar', '16000', '-f', 'wav', tempPath];

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'ignore'] });
        audioStream.pipe(ffmpeg.stdin);
        ffmpeg.stdin.on('error', () => {});
        ffmpeg.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempPath)) {
                resolve({ path: tempPath, cleanup });
            } else {
                cleanup();
                reject(new Error(`ffmpeg exited with ${code}`));
            }
        });
        ffmpeg.on('error', (err) => {
            cleanup();
            reject(err);
        });
    });
}

module.exports = {
    transcribeFromFile,
    streamToTempFile,
};
