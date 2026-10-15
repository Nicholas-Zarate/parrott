/**
 * SileroVadService — VadPort implementation.
 *
 * Primary path: energy-based RMS threshold (fast, no native deps, works well
 * with decent microphones at friend-group scale).
 *
 * TODO: Replace with Silero ONNX model via onnxruntime-node for better accuracy.
 *       @ricky0123/vad-node FrameProcessor API is tightly coupled to internal
 *       model types — needs a deeper integration pass. Track in voice-plan.md.
 *       NonRealTimeVAD.new() + manual ONNX inference is the correct path.
 *
 * Frame format: 30ms 16kHz mono 16-bit PCM = 960 samples = 1920 bytes.
 * Speech threshold: RMS > SPEECH_RMS_THRESHOLD (default 800, range ~0-32768).
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { VadPort, VadResult } from '../../core/ports/vad.port.js';

/** RMS amplitude above which a frame is considered speech. Tune via env. */
const SPEECH_RMS_THRESHOLD = parseInt(process.env['VAD_SPEECH_RMS_THRESHOLD'] ?? '200', 10);

/** Smoothing: fraction of past state to carry forward (0 = no smoothing). */
const SMOOTHING = 0.3;

@Injectable()
export class SileroVadService implements VadPort, OnModuleInit {
  private readonly logger = new Logger(SileroVadService.name);
  private smoothedProb = 0;

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `SileroVadService ready (energy-based, threshold RMS=${SPEECH_RMS_THRESHOLD}). ` +
      `Silero ONNX integration is a follow-up (see voice-plan.md TODO).`,
    );
  }

  async process(frame: Buffer): Promise<VadResult> {
    if (frame.length < 2) return { isSpeech: false, probability: 0 };

    const int16 = new Int16Array(frame.buffer, frame.byteOffset, frame.length / 2);
    let sumSquares = 0;
    for (let i = 0; i < int16.length; i++) {
      const s = int16[i] ?? 0;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / int16.length);

    // Normalise to 0–1 and apply exponential smoothing
    const instantProb = Math.min(rms / (SPEECH_RMS_THRESHOLD * 2), 1);
    this.smoothedProb = SMOOTHING * this.smoothedProb + (1 - SMOOTHING) * instantProb;

    const isSpeech = rms >= SPEECH_RMS_THRESHOLD;
    return { isSpeech, probability: this.smoothedProb };
  }
}
