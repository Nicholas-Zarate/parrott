/**
 * SttPort — streaming speech-to-text port.
 *
 * Adapter: DeepgramSttService (infra/voice/deepgram-stt.service.ts)
 * Core stays free of discord.js, NestJS, and vendor SDKs.
 *
 * Frame format: 16kHz mono 16-bit little-endian PCM (16k × 2 bytes/sample × 0.030s = 960 bytes per 30ms frame).
 */

export type SttEventType = 'partial' | 'final' | 'utteranceEnd';

export interface SttEvent {
  type: SttEventType;
  /** Present on 'partial' and 'final'. Empty string on 'utteranceEnd'. */
  text: string;
}

export interface SttConnection {
  /** Feed a 16kHz mono 16-bit PCM frame. */
  send(frame: Buffer): void;
  /** Async stream of transcript events. Completes when close() is called. */
  events(): AsyncIterable<SttEvent>;
  /** Gracefully flush and close the connection. */
  close(): Promise<void>;
}

export interface SttConnectOptions {
  model?: string;
  language?: string;
}

export interface SttPort {
  /** Open a new streaming transcription connection. */
  connect(opts?: SttConnectOptions): SttConnection;
}
