/**
 * VoiceSession — IDLE → LISTENING → THINKING → SPEAKING state machine.
 *
 * Plain class (NOT @Injectable). One instance per active voice channel.
 * Created/destroyed by VoiceSessionManager (the singleton).
 *
 * Responsibilities:
 *   - Receive 16kHz PCM frames (from audio-ingest)
 *   - Run VAD on each frame
 *   - In IDLE: detect "parrot" trigger via VAD-gated STT → open conversational window
 *   - In LISTENING: collect utterance from engaged speaker → agent call
 *   - In THINKING: stream agent response through sentence chunker → TTS
 *   - In SPEAKING: detect barge-in (VAD on engaged speaker) → abort + restart
 *   - Window idle timeout (~30s) → return to IDLE
 */

import { Logger } from '@nestjs/common';
import { createAudioPlayer, type VoiceConnection } from '@discordjs/voice';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Agent } from '@mastra/core/agent';
import type { SttPort, SttConnection } from '../../../core/ports/stt.port.js';
import type { VadPort } from '../../../core/ports/vad.port.js';
import type { TtsPort } from '../../../core/ports/tts.port.js';
import { guildContext } from '../../../infra/parrott-agent.provider.js';
import { buildMemoryScope } from '../../../core/memory/memory-scope.js';
import { attachIngest } from './audio-ingest.js';
import { playTts } from './audio-output.js';
import { sentenceChunker } from './sentence-chunker.js';

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

const WAKE_REGEX = /\bparr?o[t]?t?\b/i;
const WINDOW_TIMEOUT_MS = 30_000;
const BARGE_IN_SPEECH_PROB = 0.6; // slightly higher than VAD threshold to reduce false positives

export interface VoiceSessionOptions {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  vad: VadPort;
  stt: SttPort;
  /** Resolve the active TtsPort per-turn so feature-flag swaps take effect mid-session. */
  resolveTts: () => TtsPort;
  agent: Agent;
  useMemory: boolean;
  supabase: SupabaseClient;
  onDestroy?: () => void;
}

export class VoiceSession {
  private readonly logger = new Logger('VoiceSession');

  readonly guildId: string;
  readonly channelId: string;

  private state: VoiceState = 'IDLE';
  private engagedUserId: string | null = null;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private sttConnection: SttConnection | null = null;
  private cleanupIngest: (() => void) | null = null;

  private readonly player = createAudioPlayer();
  private readonly connection: VoiceConnection;
  private readonly vad: VadPort;
  private readonly stt: SttPort;
  private readonly resolveTts: () => TtsPort;
  private readonly agent: Agent;
  private readonly useMemory: boolean;
  private readonly supabase: SupabaseClient;
  private readonly onDestroy?: () => void;
  private sessionDbId: string | null = null;

  constructor(opts: VoiceSessionOptions) {
    this.guildId = opts.guildId;
    this.channelId = opts.channelId;
    this.connection = opts.connection;
    this.vad = opts.vad;
    this.stt = opts.stt;
    this.resolveTts = opts.resolveTts;
    this.agent = opts.agent;
    this.useMemory = opts.useMemory;
    this.supabase = opts.supabase;
    this.onDestroy = opts.onDestroy;

    this.connection.subscribe(this.player);
  }

  /** Start audio ingest, open the initial IDLE STT connection, and create a DB session row. */
  start(): void {
    void this.createSessionRow();
    this.openSttConnection(); // IDLE: VAD-gated STT for wake detection
    this.cleanupIngest = attachIngest(
      this.connection.receiver,
      (userId, frame) => void this.onFrame(userId, frame),
    );
    this.logger.log(`[Voice] session started guild=${this.guildId} channel=${this.channelId}`);
  }

  /** Tear down everything — called by manager on disconnect or shutdown. */
  async destroy(reason: 'disconnect' | 'leave_command' | 'shutdown' = 'disconnect'): Promise<void> {
    this.clearWindowTimer();
    this.cleanupIngest?.();
    this.abortController?.abort();
    await this.sttConnection?.close();
    this.player.stop(true);
    this.connection.destroy();
    void this.closeSessionRow(reason);
    this.logger.log(`[Voice] session destroyed guild=${this.guildId} reason=${reason}`);
    this.onDestroy?.();
  }

  // ── Frame handler ─────────────────────────────────────────────────────────

  private async onFrame(userId: string, frame: Buffer): Promise<void> {
    const { isSpeech, probability } = await this.vad.process(frame);

    switch (this.state) {
      case 'IDLE':
        // Feed all speech frames to STT for wake-word detection
        if (isSpeech && this.sttConnection) {
          this.sttConnection.send(frame);
        }
        break;

      case 'LISTENING':
        if (userId !== this.engagedUserId) return;
        if (isSpeech && this.sttConnection) {
          this.sttConnection.send(frame);
        }
        break;

      case 'SPEAKING':
        // Barge-in: engaged speaker starts talking while bot is speaking
        if (userId === this.engagedUserId && probability >= BARGE_IN_SPEECH_PROB) {
          this.logger.log(`[Voice] barge-in detected from ${userId}`);
          this.handleBargeIn();
        }
        break;

      case 'THINKING':
        // No barge-in during THINKING — already aborting is handled via AbortSignal
        break;
    }
  }

  // ── State transitions ─────────────────────────────────────────────────────

  private openSttConnection(): void {
    this.sttConnection?.close().catch(() => null);
    this.sttConnection = this.stt.connect();

    // Consume events in background
    void this.consumeSttEvents();
  }

  private async consumeSttEvents(): Promise<void> {
    if (!this.sttConnection) return;
    try {
      for await (const event of this.sttConnection.events()) {
        if (event.type === 'final' && event.text) {
          this.onTranscriptFinal(event.text);
        } else if (event.type === 'utteranceEnd' && this.state === 'LISTENING') {
          // utteranceEnd with no more text = end of turn → run agent
          // (onTranscriptFinal handles the actual utterance text)
        }
      }
    } catch (err) {
      this.logger.debug(`[Voice] STT event stream ended: ${String(err)}`);
    }
  }

  private onTranscriptFinal(text: string): void {
    this.logger.debug(`[Voice] transcript [${this.state}]: "${text}"`);

    if (this.state === 'IDLE') {
      if (WAKE_REGEX.test(text)) {
        this.logger.log(`[Voice] wake word detected: "${text}"`);
        this.transitionToListening(null); // engaged speaker set on next utterance
      }
      return;
    }

    if (this.state === 'LISTENING') {
      // Full utterance from engaged speaker → run agent
      void this.runAgent(text);
    }
  }

  private transitionToListening(userId: string | null): void {
    this.state = 'LISTENING';
    this.engagedUserId = userId;
    this.resetWindowTimer();
    this.openSttConnection(); // fresh connection for the conversational window
    this.logger.log(`[Voice] → LISTENING (engaged=${userId ?? 'next-speaker'})`);
  }

  private async runAgent(utterance: string): Promise<void> {
    this.state = 'THINKING';
    this.clearWindowTimer();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.logger.log(`[Voice] → THINKING: "${utterance.slice(0, 60)}"`);

    try {
      const { threadId, resourceId } = buildMemoryScope(this.channelId, this.engagedUserId ?? 'unknown');
      const startMs = Date.now();

      const result = await guildContext.run(this.guildId, () =>
        this.agent.stream(
          [{ role: 'user', content: utterance }],
          {
            ...(this.useMemory ? { memory: { thread: threadId, resource: resourceId } } : {}),
            abortSignal: signal,
          },
        ),
      );

      this.state = 'SPEAKING';
      this.logger.log(`[Voice] → SPEAKING (LLM first token ${Date.now() - startMs}ms)`);

      // Resolve active TTS provider for this turn (honours live feature-flag swap).
      const tts = this.resolveTts();

      // Stream tokens → sentence chunks → TTS → Discord player
      let fullResponse = '';
      let firstAudioMs: number | null = null;

      const tokenStream = (async function* () {
        for await (const chunk of result.textStream) {
          if (signal.aborted) break;
          fullResponse += chunk;
          yield chunk;
        }
      })();

      for await (const sentence of sentenceChunker(tokenStream)) {
        if (signal.aborted) break;

        const firstAudioAt = await playTts(sentence, tts, this.player, signal);
        if (firstAudioAt !== null && firstAudioMs === null) {
          firstAudioMs = firstAudioAt - startMs;
          this.logger.log(`[Voice] first-audio ${firstAudioMs}ms after user stopped`);
        }
      }

      const interrupted = signal.aborted;
      this.saveTurn({
        userId: this.engagedUserId ?? 'unknown',
        userText: utterance,
        responseText: fullResponse,
        toolsCalled: [],
        interrupted,
        firstAudioMs,
      });

      if (!signal.aborted) {
        this.logger.log('[Voice] → LISTENING (TTS done, window still open)');
        this.transitionToListening(this.engagedUserId);
      }
    } catch (err) {
      if (!signal.aborted) {
        this.logger.error(`[Voice] agent error: ${String(err)}`);
        this.transitionToListening(this.engagedUserId);
      }
    }
  }

  private handleBargeIn(): void {
    this.abortController?.abort();
    this.player.stop(true);
    this.logger.log('[Voice] barge-in → LISTENING');
    this.transitionToListening(this.engagedUserId);
  }

  // ── Window timer ──────────────────────────────────────────────────────────

  private resetWindowTimer(): void {
    this.clearWindowTimer();
    this.windowTimer = setTimeout(() => {
      this.logger.log('[Voice] window idle timeout → IDLE');
      this.state = 'IDLE';
      this.engagedUserId = null;
      this.openSttConnection();
    }, WINDOW_TIMEOUT_MS);
  }

  private clearWindowTimer(): void {
    if (this.windowTimer !== null) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /** Create voice_sessions row. Uses v1 column names (created_at = started_at). */
  private async createSessionRow(): Promise<void> {
    const { data, error } = await this.supabase
      .from('voice_sessions')
      .insert({ guild_id: this.guildId, channel_id: this.channelId })
      .select('id')
      .single();

    if (error) {
      this.logger.warn(`[Voice] session row insert failed: ${error.message}`);
    } else {
      this.sessionDbId = data.id as string;
    }
  }

  private async closeSessionRow(reason: string): Promise<void> {
    if (!this.sessionDbId) return;
    const { error } = await this.supabase
      .from('voice_sessions')
      .update({ ended_at: new Date().toISOString(), end_reason: reason })
      .eq('id', this.sessionDbId);

    if (error) this.logger.warn(`[Voice] session row close failed: ${error.message}`);
  }

  /** Save one exchange. Uses v1 column names for existing columns. */
  saveTurn(opts: {
    userId: string;
    userText: string;
    responseText: string;
    toolsCalled: string[];
    interrupted: boolean;
    firstAudioMs: number | null;
  }): void {
    if (!this.sessionDbId) return;

    void this.supabase.from('voice_session_turns').insert({
      session_id:       this.sessionDbId,
      guild_id:         this.guildId,
      channel_id:       this.channelId,
      // v1 column names
      speaker_user_id:  opts.userId,
      utterance_text:   opts.userText,
      parrott_response: opts.responseText,
      tool_calls:       opts.toolsCalled,
      // v2 columns
      interrupted:      opts.interrupted,
      first_audio_ms:   opts.firstAudioMs,
    }).then(({ error }) => {
      if (error) this.logger.warn(`[Voice] turn row insert failed: ${error.message}`);
    });
  }
}
