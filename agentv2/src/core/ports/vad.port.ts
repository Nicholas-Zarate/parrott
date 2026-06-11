/**
 * VadPort — voice activity detection port.
 *
 * Adapter: SileroVadService (infra/voice/silero-vad.service.ts)
 * Frame format: 30ms of 16kHz mono 16-bit PCM = 960 samples = 1920 bytes.
 * Typical latency: ~1ms per frame (Silero ONNX, CPU).
 */

export interface VadResult {
  isSpeech: boolean;
  /** Silero confidence — 0.0 (silence) to 1.0 (definite speech). */
  probability: number;
}

export interface VadPort {
  /**
   * Process one 30ms 16kHz mono PCM frame.
   * Call on every ingest frame — cheap enough to run continuously.
   */
  process(frame: Buffer): Promise<VadResult>;
}
