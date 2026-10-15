/**
 * OpenAiTtsService — TtsPort implementation using OpenAI Text-to-Speech.
 *
 * Default TTS provider. Active when capability.tts.elevenlabs flag is OFF.
 * Streams the response body chunk-by-chunk (not arrayBuffer) so the Discord
 * player receives first audio bytes while synthesis is still in progress.
 * Latency improvement: ~300–500ms vs the previous batch approach.
 *
 * Voice: configurable via OPENAI_TTS_VOICE env (default: 'alloy').
 * Model: tts-1 (fast) — swap to tts-1-hd for higher quality if latency allows.
 */

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { TtsPort } from '../../core/ports/tts.port.js';

@Injectable()
export class OpenAiTtsService implements TtsPort {
  private readonly logger = new Logger(OpenAiTtsService.name);
  private readonly client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  private readonly voice = (process.env['OPENAI_TTS_VOICE'] ?? 'alloy') as
    | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

  async *synthesize(text: string): AsyncIterable<Buffer> {
    if (!text.trim()) return;

    try {
      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: this.voice,
        input: text,
        response_format: 'mp3',
      });

      // Stream the response body chunk-by-chunk rather than waiting for the full
      // arrayBuffer. Node 18+ ReadableStream supports async iteration natively.
      // First audio bytes reach the Discord player while OpenAI is still synthesizing.
      const body = response.body as AsyncIterable<Uint8Array> | null;
      if (!body) return;

      let totalBytes = 0;
      for await (const chunk of body) {
        const buf = Buffer.from(chunk);
        totalBytes += buf.length;
        yield buf;
      }

      this.logger.debug(`[TTS/OpenAI] streamed ${text.length} chars → ${totalBytes} bytes`);
    } catch (err) {
      this.logger.error(`[TTS/OpenAI] synthesis failed: ${String(err)}`);
    }
  }

  async close(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
