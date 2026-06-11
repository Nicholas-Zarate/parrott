/**
 * OpenAiTtsService — TtsPort implementation using OpenAI Text-to-Speech.
 *
 * Default TTS provider. Active when capability.tts.elevenlabs flag is OFF.
 * Returns one mp3 Buffer per synthesize() call (batch, not streaming).
 * Latency: ~300-500ms added vs ElevenLabs Flash WS streaming.
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

      // OpenAI returns the full audio blob — yield as a single chunk.
      // The pipeline treats it identically to ElevenLabs streaming chunks.
      const buffer = Buffer.from(await response.arrayBuffer());
      yield buffer;

      this.logger.debug(`[TTS/OpenAI] synthesized ${text.length} chars → ${buffer.length} bytes`);
    } catch (err) {
      this.logger.error(`[TTS/OpenAI] synthesis failed: ${String(err)}`);
    }
  }

  async close(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
