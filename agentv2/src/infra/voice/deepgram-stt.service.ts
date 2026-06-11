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
      utterance_end_ms: 1000, // 1s of silence → utterance end
      vad_events: true,
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

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data?.channel?.alternatives?.[0];
      const text: string = alt?.transcript ?? '';
      if (!text) return;

      if (data.is_final) {
        enqueue({ type: 'final', text });
      } else {
        enqueue({ type: 'partial', text });
      }

      // speech_final = Deepgram's own utterance boundary (in addition to UtteranceEnd)
      if (data.speech_final) {
        enqueue({ type: 'utteranceEnd', text: '' });
      }
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      enqueue({ type: 'utteranceEnd', text: '' });
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      this.logger.error(`[STT/Deepgram] error: ${String(err)}`);
      complete();
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
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

    return {
      send(frame: Buffer): void {
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
