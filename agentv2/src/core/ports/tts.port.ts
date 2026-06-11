/**
 * TtsPort — streaming text-to-speech port.
 *
 * synthesize(text) → AsyncIterable<Buffer>:
 *   OpenAI TTS:          yields one Buffer (full audio blob, mp3)
 *   ElevenLabs Flash WS: yields many small Buffers (streaming chunks, mp3)
 *
 * Both are piped into createAudioResource(StreamType.Arbitrary) — the pipeline
 * is identical regardless of provider. Active provider is selected by the
 * capability.tts.elevenlabs feature flag via DiscordTtsService.
 *
 * Audio format: mp3. Transcoded to 48kHz Opus by prism-media/ffmpeg in audio-output.ts.
 */

export interface TtsPort {
  /**
   * Synthesize text → audio chunks.
   * Each Buffer is a raw mp3 chunk suitable for streaming into createAudioResource.
   */
  synthesize(text: string): AsyncIterable<Buffer>;

  /** Close any open connections (websocket, HTTP stream). No-op if not open. */
  close(): Promise<void>;
}
