/**
 * Core ports — plain interfaces; no Discord or Nest types cross this boundary.
 * Adapters (platforms/discord/) implement these; core/ only depends on them.
 */

/** An incoming message, translated to plain types by the platform adapter. */
export interface IncomingMessage {
  /** Raw text of the message (after stripping the @mention). */
  text: string;
  /** Discord user snowflake. Used as resourceId: `discord:${userId}` */
  userId: string;
  /** Discord channel snowflake. Used as threadId: `discord:${channelId}` */
  channelId: string;
  /** Discord guild snowflake, if applicable. */
  guildId?: string;
  /** Display name for logging / personality context. */
  username: string;
  /** Original Discord message ID (for reply threading + history write). */
  messageId: string;
}

/** Text output sink — the Discord adapter implements this to send/edit a reply. */
export interface Replier {
  /**
   * Send a placeholder reply immediately, then edit it to `text` when ready.
   * (v1 pattern: placeholder + single edit — avoids Discord edit-rate-limit G5)
   */
  reply(text: string): Promise<void>;
  /**
   * Send the placeholder message and return a function that edits it.
   * Useful when you need to start streaming before the full reply is ready.
   */
  placeholder(text: string): Promise<(finalText: string) => Promise<void>>;
}

/** Audio output sink — the voice adapter implements this to play TTS audio. */
export interface VoiceSink {
  /** Play PCM or Opus audio in the connected voice channel. */
  speak(audio: Buffer, encoding?: 'pcm' | 'opus'): Promise<void>;
  /** Whether a voice connection is currently active. */
  isConnected(): boolean;
}
