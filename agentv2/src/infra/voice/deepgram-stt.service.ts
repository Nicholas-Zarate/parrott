/**
 * DeepgramSttService — SttPort implementation using Deepgram Nova-3.
 *
 * Streams 16kHz mono 16-bit PCM frames over a websocket.
 * Emits: 'partial' (interim), 'final' (is_final), 'utteranceEnd' (speech_final / UtteranceEnd event).
 *
 * SDK: @deepgram/sdk v3 (NOT v5 — v5 is a different Fern-generated API).
 * Requires: DEEPGRAM_API_KEY env var.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { SttPort, SttConnection, SttConnectOptions, SttEvent } from '../../core/ports/stt.port.js';

const DEEPGRAM_MODEL = process.env['DEEPGRAM_MODEL'] ?? 'nova-3';

@Injectable()
export class DeepgramSttService implements SttPort {
  private readonly logger = new Logger(DeepgramSttService.name);
  private readonly client = createClient(process.env['DEEPGRAM_API_KEY'] ?? '');

  connect(opts?: SttConnectOptions): SttConnection {
    const model = opts?.model ?? DEEPGRAM_MODEL;
    const language = opts?.language ?? 'en-US';

    // Open a Deepgram live transcription websocket
    const connection = this.client.listen.live({
      model,
      language,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000,  // word-timing gap → UtteranceEnd event (fallback)
      endpointing: 300,         // audio silence → speech_final=true (primary trigger)
      vad_events: true,
      keyterms: ['parrot', 'parrott'], // Nova-3 vocabulary boost (Nova-2 uses 'keywords')
    });

    // Push-based event queue → async iterable bridge
    let resolve: ((value: IteratorResult<SttEvent>) => void) | null = null;
    const queue: SttEvent[] = [];
    let done = false;

    const enqueue = (event: SttEvent) => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: event, done: false });
      } else {
        queue.push(event);
      }
    };

    const complete = () => {
      done = true;
      if (resolve) {
        resolve({ value: { type: 'utteranceEnd', text: '' }, done: true });
        resolve = null;
      }
    };

    // Accumulate is_final phrases until speech_final=true marks the utterance boundary.
    // Multiple is_final=true events can arrive for one utterance (phrase-level finals).
    // speech_final=true (fired by endpointing after 300ms silence) is the real boundary.
    let finalBuffer = '';

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data?.channel?.alternatives?.[0];
      const text: string = alt?.transcript ?? '';
      this.logger.log(`[STT/Deepgram] transcript event: is_final=${String(data?.is_final)} speech_final=${String(data?.speech_final)} text="${text}"`);

      if (!text) return;

      if (!data.is_final) {
        // Interim partial — emit for wake-word detection in IDLE and UX feedback in LISTENING
        enqueue({ type: 'partial', text });
        return;
      }

      // is_final=true: accumulate into buffer
      finalBuffer = finalBuffer ? `${finalBuffer} ${text}` : text;

      if (data.speech_final) {
        // Utterance boundary — emit accumulated transcript and clear buffer
        const utterance = finalBuffer;
        finalBuffer = '';
        enqueue({ type: 'final', text: utterance });
        enqueue({ type: 'utteranceEnd', text: '' });
      }
      // else: more phrases expected — keep accumulating
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      enqueue({ type: 'utteranceEnd', text: '' });
    });

    // Send keepalive every 8s so Deepgram doesn't close the connection during silence gaps.
    const keepAliveTimer = setInterval(() => {
      if (!done) {
        try { connection.keepAlive(); } catch { /* ignore if already closed */ }
      }
    }, 8_000);

    connection.on(LiveTranscriptionEvents.Open, () => {
      this.logger.log(`[STT/Deepgram] connection open (model=${model})`);
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      const msg = (err as { message?: string })?.message ?? JSON.stringify(err);
      this.logger.error(`[STT/Deepgram] error: ${msg}`);
      clearInterval(keepAliveTimer);
      complete();
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      this.logger.log('[STT/Deepgram] connection closed');
      clearInterval(keepAliveTimer);
      complete();
    });

    const asyncIterator: AsyncIterator<SttEvent> = {
      next(): Promise<IteratorResult<SttEvent>> {
        if (queue.length > 0) {
          return Promise.resolve({ value: queue.shift()!, done: false });
        }
        if (done) {
          return Promise.resolve({ value: { type: 'utteranceEnd', text: '' }, done: true });
        }
        return new Promise((r) => { resolve = r; });
      },
    };

    let sendCount = 0;
    const logger = this.logger;

    return {
      send(frame: Buffer): void {
        sendCount++;
        if (sendCount === 1 || sendCount % 25 === 0) {
          logger.log(`[STT/Deepgram] sent frame #${sendCount} to Deepgram (${frame.byteLength} bytes)`);
        }
        // Deepgram v3 expects Blob | ArrayBuffer | string — convert Buffer
        connection.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer);
      },

      events(): AsyncIterable<SttEvent> {
        return { [Symbol.asyncIterator]: () => asyncIterator };
      },

      async close(): Promise<void> {
        connection.requestClose();
        complete();
      },
    };
  }
}
