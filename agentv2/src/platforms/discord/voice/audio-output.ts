/**
 * AudioOutput — streams TtsPort audio chunks into the Discord AudioPlayer.
 *
 * TTS yields mp3 chunks → Node.js PassThrough stream →
 *   createAudioResource(StreamType.Arbitrary) → prism-media/ffmpeg
 *   transcodes to 48kHz stereo Opus → Discord player.
 *
 * The transcode hop is unavoidable: Discord needs 48kHz stereo Opus;
 * OpenAI/ElevenLabs output is mp3 at a lower sample rate.
 * Streaming (not file-based) keeps the latency acceptable.
 *
 * Resolves voice-plan.md "TTS audio → Discord format" risk (⚠️ Real friction, solved).
 */

import { PassThrough } from 'stream';
import {
  createAudioResource,
  StreamType,
  type AudioPlayer,
} from '@discordjs/voice';
import type { TtsPort } from '../../../core/ports/tts.port.js';

/**
 * Play all TTS audio for a text string.
 * Returns when playback completes or is interrupted.
 *
 * @param text        The text to synthesize
 * @param tts         Active TtsPort (OpenAI or ElevenLabs)
 * @param player      The Discord AudioPlayer for the voice channel
 * @param signal      AbortSignal — triggers barge-in stop
 * @returns           Timestamp of first audio (ms since epoch), or null if aborted early
 */
export async function playTts(
  text: string,
  tts: TtsPort,
  player: AudioPlayer,
  signal: AbortSignal,
): Promise<number | null> {
  if (signal.aborted) return null;

  const passthrough = new PassThrough();
  const resource = createAudioResource(passthrough, {
    inputType: StreamType.Arbitrary,
    inlineVolume: false,
  });

  let firstAudioAt: number | null = null;

  player.play(resource);

  // Pipe TTS chunks into the passthrough stream
  const pipeChunks = async () => {
    try {
      for await (const chunk of tts.synthesize(text)) {
        if (signal.aborted) break;
        if (firstAudioAt === null) firstAudioAt = Date.now();
        passthrough.push(chunk);
      }
    } finally {
      passthrough.push(null); // signal EOF
    }
  };

  // On barge-in: destroy the stream → player stops
  const onAbort = () => {
    passthrough.destroy();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  await pipeChunks();
  signal.removeEventListener('abort', onAbort);

  // Wait for player to finish (or get interrupted)
  if (!signal.aborted) {
    await new Promise<void>((resolve) => {
      resource.playStream.once('close', resolve);
      resource.playStream.once('end', resolve);
    });
  }

  return firstAudioAt;
}
