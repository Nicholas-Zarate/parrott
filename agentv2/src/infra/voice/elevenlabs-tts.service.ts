/**
 * ElevenLabsTtsService — TtsPort implementation using ElevenLabs Flash v2.5.
 *
 * Feature-flagged: only active when capability.tts.elevenlabs is LIVE.
 * Uses the streaming textToSpeech endpoint — yields mp3 chunks progressively.
 * First-audio latency target: < 1.5s (Flash model + streaming).
 *
 * Requires: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID env vars.
 * SDK: @elevenlabs/elevenlabs-js
 *
 * TODO: upgrade to WebSocket input-streaming (eleven_flash_v2_5 ws) for
 *       sentence-by-sentence streaming once the SDK stabilises that API.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { TtsPort } from '../../core/ports/tts.port.js';

@Injectable()
export class ElevenLabsTtsService implements TtsPort {
  private readonly logger = new Logger(ElevenLabsTtsService.name);

  private readonly client = new ElevenLabsClient({
    apiKey: process.env['ELEVENLABS_API_KEY'] ?? '',
  });

  private readonly voiceId = process.env['ELEVENLABS_VOICE_ID'] ?? 'Rachel';

  async *synthesize(text: string): AsyncIterable<Buffer> {
    if (!text.trim()) return;

    try {
      // stream() returns an async iterable of Uint8Array audio chunks (mp3).
      const stream = await this.client.textToSpeech.stream(this.voiceId, {
        modelId: 'eleven_flash_v2_5',
        text,
        outputFormat: 'mp3_44100_128',
      });

      let totalBytes = 0;
      for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        totalBytes += buf.length;
        yield buf;
      }

      this.logger.debug(`[TTS/ElevenLabs] streamed ${text.length} chars → ${totalBytes} bytes`);
    } catch (err) {
      this.logger.error(`[TTS/ElevenLabs] synthesis failed: ${String(err)}`);
    }
  }

  async close(): Promise<void> {
    // HTTP streaming — no persistent connection to close.
  }
}
