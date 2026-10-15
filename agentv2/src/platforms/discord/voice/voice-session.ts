/**
 * VoiceSession — IDLE → LISTENING → THINKING → SPEAKING state machine.
 *
 * Plain class (NOT @Injectable). One instance per active voice channel.
 * Created/destroyed by VoiceSessionManager (the singleton).
 *
 * Responsibilities:
 *   - Receive 16kHz PCM frames (from audio-ingest)
 *   - Run VAD on each frame
 *   - In IDLE: one STT stream per speaker (opened lazily on speech) → detect "parrot"
 *   - In LISTENING: collect utterance from the engaged speaker → agent call
 *   - In THINKING: stream agent response through sentence chunker → TTS
 *   - In SPEAKING: detect barge-in (VAD on engaged speaker) → abort + restart
 *   - Window idle timeout (~30s) → return to IDLE
 *
 * STT is per speaker because Discord delivers each user's audio separately; feeding
 * everyone into one stream interleaves 30ms slices of different voices and Deepgram
 * returns garbage. Idle streams are closed after a few seconds of silence.
 */

import { Logger } from '@nestjs/common';
import { createAudioPlayer, type VoiceConnection } from '@discordjs/voice';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Agent } from '@mastra/core/agent';
import type { SttPort, SttConnection, SttEvent } from '../../../core/ports/stt.port.js';
import type { VadPort } from '../../../core/ports/vad.port.js';
import type { TtsPort } from '../../../core/ports/tts.port.js';
import { guildContext } from '../../../infra/parrott-agent.provider.js';
import { buildMemoryScope } from '../../../core/memory/memory-scope.js';
import { attachIngest } from './audio-ingest.js';
import { playTts, playTtsStream } from './audio-output.js';
import { sentenceChunker } from './sentence-chunker.js';

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

// Wake phrase: "(hey) mister parrot". The "mister" makes the phrase distinctive enough that the
// last word can stay loose — Deepgram mishears "parrot" as perra, parra, perro, perry, barry,
// harrod, harold — without a plain name like "Harol" waking the bot.
export const WAKE_REGEX =
  /\b(?:hey[,.!]?\s+)?(?:mr\.?|mister)[,.]?\s+(?:p[ae]rr?[oa]t?t?|perry|barry|harrod|harold)\b/i;
const WINDOW_TIMEOUT_MS = 30_000;
const BARGE_IN_SPEECH_PROB = 0.6; // slightly higher than VAD threshold to reduce false positives
// Safety net only — the voice prompt asks for 1–2 sentences; this stops a runaway reply.
const VOICE_MAX_OUTPUT_TOKENS = 220;
const STT_IDLE_CLOSE_MS = 15_000;
const STT_SWEEP_INTERVAL_MS = 5_000;
const STT_MAX_BACKOFF_MS = 30_000;

/**
 * Drop everything up to and including the wake phrase, so "hey y'all, hey mister parrot,
 * what time is it" becomes "what time is it".
 */
export function stripWakeWord(text: string): string {
  const match = WAKE_REGEX.exec(text);
  if (!match) return text.trim();
  return text
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?:;—-]+/, '')
    .trim();
}

export interface VoiceTurnConfig {
  modelId: string;
  instructions: string;
}

export interface VoiceSessionOptions {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  vad: VadPort;
  stt: SttPort;
  /** Resolve the active TtsPort per-turn so feature-flag swaps take effect mid-session. */
  resolveTts: () => TtsPort;
  /** Resolve the voice model + spoken-mode instructions per-turn (DB-backed, cached). */
  resolveTurnConfig: () => Promise<VoiceTurnConfig>;
  agent: Agent;
  useMemory: boolean;
  supabase: SupabaseClient;
  onDestroy?: () => void;
}

interface SpeakerStt {
  connection: SttConnection;
  lastFrameAt: number;
  closedByUs: boolean;
}

export class VoiceSession {
  private readonly logger = new Logger('VoiceSession');

  readonly guildId: string;
  readonly channelId: string;

  private state: VoiceState = 'IDLE';
  private engagedUserId: string | null = null;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private cleanupIngest: (() => void) | null = null;
  private destroyed = false;
  private lastPartialText = ''; // fallback for utteranceEnd when final hasn't arrived yet
  private awaitingFirstUtterance = false; // true right after wake — strip the wake word from the next final

  private readonly speakerStt = new Map<string, SpeakerStt>();
  private readonly sttFailures = new Map<string, number>();
  private readonly sttCooldownUntil = new Map<string, number>();

  private readonly player = createAudioPlayer();
  private readonly connection: VoiceConnection;
  private readonly vad: VadPort;
  private readonly stt: SttPort;
  private readonly resolveTts: () => TtsPort;
  private readonly resolveTurnConfig: () => Promise<VoiceTurnConfig>;
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
    this.resolveTurnConfig = opts.resolveTurnConfig;
    this.agent = opts.agent;
    this.useMemory = opts.useMemory;
    this.supabase = opts.supabase;
    this.onDestroy = opts.onDestroy;

    this.connection.subscribe(this.player);
  }

  /** Start audio ingest and create a DB session row. STT streams open lazily per speaker. */
  start(): void {
    void this.createSessionRow();
    this.cleanupIngest = attachIngest(
      this.connection.receiver,
      (userId, frame) => void this.onFrame(userId, frame),
    );
    this.sweepTimer = setInterval(() => this.sweepIdleStt(), STT_SWEEP_INTERVAL_MS);
    this.logger.log(`[Voice] session started guild=${this.guildId} channel=${this.channelId} — waiting for "hey mister parrot"`);
  }

  /** Play a short join greeting via TTS. Fire-and-forget from the manager. */
  async greet(): Promise<void> {
    const greeting = "Squawk! I'm in. Say \"hey mister parrot\" to wake me up.";
    const tts = this.resolveTts();
    const ac = new AbortController();
    try {
      await playTts(greeting, tts, this.player, ac.signal);
    } catch (err) {
      this.logger.warn(`[Voice] greeting TTS failed: ${String(err)}`);
    }
  }

  /** Tear down everything — called by manager on disconnect or shutdown. */
  async destroy(reason: 'disconnect' | 'leave_command' | 'shutdown' = 'disconnect'): Promise<void> {
    this.destroyed = true; // must be set before closing STT to prevent reconnects
    this.clearWindowTimer();
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.cleanupIngest?.();
    this.abortController?.abort();
    await this.closeAllStt();
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
        // Each speaker gets their own stream; only speech frames so idle users cost nothing.
        if (isSpeech) this.sendToStt(userId, frame);
        break;

      case 'LISTENING':
        // Fallback only — wake normally sets the engaged speaker directly.
        if (this.engagedUserId === null) {
          if (!isSpeech) return;
          this.engagedUserId = userId;
          this.logger.log(`[Voice] engaged speaker set: ${userId}`);
        }
        if (userId !== this.engagedUserId) return;
        // Send ALL frames (speech + silence) once engaged — Deepgram needs the
        // silence frames (DTX from Discord) to count endpointing and fire speech_final.
        this.sendToStt(userId, frame);
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

  // ── STT streams (one per speaker) ─────────────────────────────────────────

  private sendToStt(userId: string, frame: Buffer): void {
    const entry = this.sttFor(userId);
    if (!entry) return;
    entry.lastFrameAt = Date.now();
    try {
      entry.connection.send(frame);
    } catch (err) {
      this.logger.debug(`[Voice] STT send failed (${userId}): ${String(err)}`);
    }
  }

  private sttFor(userId: string): SpeakerStt | null {
    const existing = this.speakerStt.get(userId);
    if (existing) return existing;
    if (this.destroyed) return null;
    if (Date.now() < (this.sttCooldownUntil.get(userId) ?? 0)) return null;

    const entry: SpeakerStt = {
      connection: this.stt.connect({ label: userId }),
      lastFrameAt: Date.now(),
      closedByUs: false,
    };
    this.speakerStt.set(userId, entry);
    this.logger.log(`[Voice] STT opened for ${userId} (state=${this.state}, open=${this.speakerStt.size})`);
    void this.consumeSttEvents(userId, entry);
    return entry;
  }

  private closeStt(userId: string): void {
    const entry = this.speakerStt.get(userId);
    if (!entry) return;
    entry.closedByUs = true;
    this.speakerStt.delete(userId);
    entry.connection.close().catch(() => null);
  }

  private closeOtherStt(keepUserId: string): void {
    for (const userId of [...this.speakerStt.keys()]) {
      if (userId !== keepUserId) this.closeStt(userId);
    }
  }

  private async closeAllStt(): Promise<void> {
    const entries = [...this.speakerStt.values()];
    this.speakerStt.clear();
    for (const entry of entries) entry.closedByUs = true;
    await Promise.all(entries.map((e) => e.connection.close().catch(() => null)));
  }

  private sweepIdleStt(): void {
    const cutoff = Date.now() - STT_IDLE_CLOSE_MS;
    for (const [userId, entry] of this.speakerStt) {
      if (this.state !== 'IDLE' && userId === this.engagedUserId) continue;
      if (entry.lastFrameAt < cutoff) {
        this.logger.debug(`[Voice] STT idle-closed for ${userId}`);
        this.closeStt(userId);
      }
    }
  }

  private async consumeSttEvents(userId: string, entry: SpeakerStt): Promise<void> {
    let sawTranscript = false;
    try {
      for await (const event of entry.connection.events()) {
        if (this.speakerStt.get(userId) !== entry) break; // replaced or closed
        if (!event.text && event.type !== 'utteranceEnd') continue;
        if (event.text) sawTranscript = true;
        this.onSttEvent(userId, event);
      }
    } catch (err) {
      this.logger.debug(`[Voice] STT event stream ended (${userId}): ${String(err)}`);
    }

    if (this.speakerStt.get(userId) === entry) this.speakerStt.delete(userId);
    if (this.destroyed || entry.closedByUs) return;

    // The stream reopens lazily on the speaker's next frame. If it died without ever
    // producing text (auth error, quota), back off so we don't open a socket per frame.
    if (sawTranscript) {
      this.sttFailures.delete(userId);
      return;
    }
    const failures = (this.sttFailures.get(userId) ?? 0) + 1;
    this.sttFailures.set(userId, failures);
    const delay = Math.min(1_000 * 2 ** failures, STT_MAX_BACKOFF_MS);
    this.sttCooldownUntil.set(userId, Date.now() + delay);
    this.logger.log(`[Voice] STT for ${userId} ended without transcript — reopening after ${delay}ms`);
  }

  // ── Transcript handling ───────────────────────────────────────────────────

  private onSttEvent(userId: string, event: SttEvent): void {
    if (this.state === 'IDLE') {
      // Partials wake ~1s sooner than finals. First match wins and sets the engaged speaker.
      if (event.type !== 'utteranceEnd' && WAKE_REGEX.test(event.text)) {
        this.logger.log(`[Voice] wake word from ${userId}: "${event.text}"`);
        this.transitionToListening(userId);
      } else if (event.type === 'final') {
        this.logger.debug(`[Voice] transcript [IDLE] ${userId}: "${event.text}"`);
      }
      return;
    }

    if (userId !== this.engagedUserId || this.state !== 'LISTENING') return;

    if (event.type === 'final') {
      this.lastPartialText = '';
      this.onUtterance(event.text);
    } else if (event.type === 'partial') {
      this.lastPartialText = event.text;
      this.logger.log(`[Voice] partial [LISTENING]: "${event.text.slice(0, 80)}"`);
    } else if (this.lastPartialText) {
      // utteranceEnd before is_final (connection dropped) — run on the last partial.
      const text = this.lastPartialText;
      this.lastPartialText = '';
      this.logger.log(`[Voice] utteranceEnd fallback → "${text.slice(0, 60)}"`);
      this.onUtterance(text);
    }
  }

  private onUtterance(text: string): void {
    this.logger.log(`[Voice] transcript [LISTENING]: "${text}"`);
    let utterance = text;
    if (this.awaitingFirstUtterance) {
      this.awaitingFirstUtterance = false;
      utterance = stripWakeWord(text);
      if (!/\w/.test(utterance)) {
        // Just "hey mister parrot" — don't spend a turn answering the wake phrase; wait for the request.
        this.logger.log('[Voice] wake phrase only — waiting for the request');
        this.awaitingFirstUtterance = true;
        this.resetWindowTimer();
        return;
      }
    }
    void this.runAgent(utterance);
  }

  // ── State transitions ─────────────────────────────────────────────────────

  private transitionToListening(userId: string | null): void {
    const wasIdle = this.state === 'IDLE';
    this.state = 'LISTENING';
    this.engagedUserId = userId;
    this.lastPartialText = '';
    this.awaitingFirstUtterance = wasIdle;
    this.resetWindowTimer();
    if (userId) {
      if (wasIdle) {
        // Keep the waker's stream — their question often overlaps the wake word. Drop the rest.
        this.closeOtherStt(userId);
      } else {
        // Coming from SPEAKING/THINKING — fresh stream so stale finals from last turn don't leak in.
        this.closeStt(userId);
        this.sttFor(userId);
      }
    }
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
      const turn = await this.resolveTurnConfig();

      const result = await guildContext.run(this.guildId, () =>
        this.agent.stream(
          [{ role: 'user', content: utterance }],
          {
            ...(this.useMemory ? { memory: { thread: threadId, resource: resourceId } } : {}),
            abortSignal: signal,
            model: turn.modelId,
            instructions: turn.instructions,
            modelSettings: { maxOutputTokens: VOICE_MAX_OUTPUT_TOKENS },
          },
        ),
      );

      this.state = 'SPEAKING';
      this.logger.log(`[Voice] → SPEAKING (stream ready ${Date.now() - startMs}ms, model=${turn.modelId})`);

      // Resolve active TTS provider for this turn (honours live feature-flag swap).
      const tts = this.resolveTts();

      // Stream tokens → sentence chunks → TTS → Discord player (one continuous stream)
      let fullResponse = '';
      let firstAudioMs: number | null = null;
      let firstTokenAt: number | null = null;
      let firstSentenceAt: number | null = null;

      const tokenStream = (async function* () {
        for await (const chunk of result.textStream) {
          if (signal.aborted) break;
          if (firstTokenAt === null) firstTokenAt = Date.now();
          fullResponse += chunk;
          yield chunk;
        }
      })();

      const sentences = (async function* () {
        for await (const sentence of sentenceChunker(tokenStream)) {
          if (firstSentenceAt === null) firstSentenceAt = Date.now();
          yield sentence;
        }
      })();

      // playTtsStream pipes all sentence chunks into a single AudioResource so the
      // Discord player never stops/restarts between sentences (no audible gaps).
      const firstAudioAt = await playTtsStream(sentences, tts, this.player, signal);
      if (firstAudioAt !== null) firstAudioMs = firstAudioAt - startMs;

      const ms = (t: number | null) => (t === null ? 'n/a' : `${t - startMs}ms`);
      this.logger.log(
        `[Voice] timing: first-token=${ms(firstTokenAt)} first-sentence=${ms(firstSentenceAt)} first-audio=${ms(firstAudioAt)}`,
      );

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
      this.awaitingFirstUtterance = false;
      this.lastPartialText = '';
      void this.closeAllStt(); // streams reopen lazily on the next speech frame
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
