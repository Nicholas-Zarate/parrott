/**
 * AudioIngest — subscribes to Discord voice receiver, decodes Opus → 16kHz mono PCM.
 *
 * Uses EndBehaviorType.Manual so streams stay open beyond Discord's silence detection.
 * Each speaker's Opus stream is decoded independently (per userId).
 * Output frames: 30ms 16kHz mono 16-bit PCM = 960 samples = 1920 bytes.
 *
 * Reuses v1's decode learnings (docs/voice-pipeline-findings-and-changes.md):
 *   - opusscript (WASM) for decode — no native build needed
 *   - Downsample 48k stereo → 16k mono (Discord sends 48kHz stereo)
 */

import { EndBehaviorType, type VoiceReceiver } from '@discordjs/voice';
import { Logger } from '@nestjs/common';
import OpusScript from 'opusscript';

const logger = new Logger('AudioIngest');

export type FrameCallback = (userId: string, frame: Buffer) => void;

const DISCORD_SAMPLE_RATE = 48000;
const VAD_SAMPLE_RATE = 16000;
const DOWNSAMPLE_RATIO = DISCORD_SAMPLE_RATE / VAD_SAMPLE_RATE; // 3
const OPUS_FRAME_SAMPLES = 960; // 20ms at 48kHz
const CHANNELS = 2; // Discord sends stereo

/** 30ms of 16kHz mono = 960 samples × 2 bytes = 1920 bytes */
const TARGET_FRAME_BYTES = (VAD_SAMPLE_RATE * 0.030) * 2;

/**
 * Attach ingest to the voice receiver.
 * Calls onFrame(userId, pcm16k) for every 30ms of decoded audio per speaker.
 * Returns a cleanup function — call on session teardown.
 */
export function attachIngest(
  receiver: VoiceReceiver,
  onFrame: FrameCallback,
): () => void {
  const activeStreams = new Map<string, () => void>();

  const onSpeakingStart = (userId: string) => {
    logger.log(`[Ingest] speaking start userId=${userId}`);
    if (activeStreams.has(userId)) {
      logger.debug(`[Ingest] already subscribed userId=${userId}`);
      return;
    }

    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    logger.log(`[Ingest] subscribed to audio stream userId=${userId}`);

    // opusscript: Application.VOIP is correct for Discord voice
    const opus = new OpusScript(DISCORD_SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
    let remainder = Buffer.alloc(0);

    let frameCount = 0;
    const onData = (opusFrame: Buffer) => {
      frameCount++;
      if (frameCount === 1 || frameCount % 100 === 0) {
        logger.log(`[Ingest] frames received userId=${userId} count=${frameCount}`);
      }
      try {
        // Decode Opus → 48kHz stereo 16-bit PCM
        const pcm48k = opus.decode(opusFrame) as Buffer;

        // Downmix stereo → mono and downsample 48k → 16k (take every Nth sample)
        const monoSamples = pcm48k.length / (CHANNELS * 2); // 16-bit = 2 bytes/sample
        const out16k: number[] = [];
        for (let i = 0; i < monoSamples; i += DOWNSAMPLE_RATIO) {
          const offset = i * CHANNELS * 2;
          const left = pcm48k.readInt16LE(offset);
          const right = pcm48k.readInt16LE(offset + 2);
          out16k.push(Math.round((left + right) / 2));
        }

        // Pack into Buffer
        const frame16k = Buffer.alloc(out16k.length * 2);
        for (let i = 0; i < out16k.length; i++) {
          frame16k.writeInt16LE(out16k[i] ?? 0, i * 2);
        }

        // Accumulate and emit 30ms frames
        remainder = Buffer.concat([remainder, frame16k]);
        while (remainder.length >= TARGET_FRAME_BYTES) {
          onFrame(userId, remainder.subarray(0, TARGET_FRAME_BYTES));
          remainder = remainder.subarray(TARGET_FRAME_BYTES);
        }
      } catch {
        // Malformed Opus frame — skip silently
      }
    };

    stream.on('data', onData);
    stream.once('end', () => {
      logger.log(`[Ingest] stream ended userId=${userId} totalFrames=${frameCount}`);
      opus.delete();
      activeStreams.delete(userId);
    });

    const stop = () => {
      stream.destroy();
      try { opus.delete(); } catch { /* already deleted */ }
      activeStreams.delete(userId);
    };

    activeStreams.set(userId, stop);
  };

  receiver.speaking.on('start', onSpeakingStart);

  return () => {
    receiver.speaking.off('start', onSpeakingStart);
    for (const stop of activeStreams.values()) stop();
    activeStreams.clear();
  };
}
