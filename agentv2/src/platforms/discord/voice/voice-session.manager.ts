/**
 * VoiceSessionManager — singleton that owns all active VoiceSession instances.
 *
 * One VoiceSession per guild (Discord server). Creates on join_voice tool call,
 * destroys on bot disconnect or OnModuleDestroy (graceful shutdown).
 *
 * Injects stateless services (VAD, STT, TTS router, agent) into each session.
 * Per-session mutable state stays inside VoiceSession (plain class, not provider).
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
} from '@discordjs/voice';
import { Client, type Guild, type VoiceChannel, type StageChannel } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SileroVadService } from '../../../infra/voice/silero-vad.service.js';
import { DeepgramSttService } from '../../../infra/voice/deepgram-stt.service.js';
import { DiscordTtsService } from '../../../infra/voice/discord-tts.service.js';
import { ParrottAgentProvider } from '../../../infra/parrott-agent.provider.js';
import { PersonalityService } from '../../../infra/personality.service.js';
import { SUPABASE_CLIENT } from '../../../infra/supabase/supabase.module.js';
import { VoiceSession } from './voice-session.js';
import { createJoinVoiceTool } from './join-voice.tool.js';

@Injectable()
export class VoiceSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceSessionManager.name);
  private readonly sessions = new Map<string, VoiceSession>();

  constructor(
    private readonly vad: SileroVadService,
    private readonly stt: DeepgramSttService,
    private readonly ttsRouter: DiscordTtsService,
    private readonly agentProvider: ParrottAgentProvider,
    private readonly personality: PersonalityService,
    private readonly client: Client,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Register the Discord-only join_voice tool with the agent.
   * Done here (not in core buildTools — core/ can't import Discord, and not in
   * VoiceModule's class — @Module classes don't get reliable constructor DI).
   * The agent's tools closure merges late tools at turn-time, so init order
   * relative to ParrottAgentProvider.onModuleInit doesn't matter.
   */
  onModuleInit(): void {
    const tool = createJoinVoiceTool(this, this.client);
    this.agentProvider.registerTool('join_voice', tool);
    this.logger.log('join_voice tool registered with Parrott agent');
  }

  /**
   * Join a voice channel and start a new VoiceSession for the guild.
   * Returns the session, or existing session if already in channel.
   */
  async join(
    channel: VoiceChannel | StageChannel,
    guild: Guild,
  ): Promise<VoiceSession> {
    const guildId = guild.id;

    if (this.sessions.has(guildId)) {
      this.logger.log(`[VoiceMgr] already in voice channel for guild=${guildId}`);
      return this.sessions.get(guildId)!;
    }

    const connection: VoiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // must hear audio for STT
      selfMute: false,
    });

    // Wait for the connection to be ready before starting the session.
    // Catches permission errors and network failures early.
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      connection.destroy();
      throw new Error(`Could not connect to #${channel.name} within 10s — check permissions and network.`);
    }

    // Auto-destroy session if the bot is kicked or the connection drops.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Give Discord 5s to auto-reconnect (e.g. region change) before destroying.
        await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        this.logger.log(`[VoiceMgr] reconnected in guild=${guildId}`);
      } catch {
        this.logger.log(`[VoiceMgr] disconnected (no reconnect) guild=${guildId} — destroying session`);
        const session = this.sessions.get(guildId);
        if (session) await session.destroy('disconnect');
      }
    });

    const agent = this.agentProvider.getAgent();
    const useMemory = this.agentProvider.isMemoryLive(guildId);

    const session = new VoiceSession({
      guildId,
      channelId: channel.id,
      connection,
      vad: this.vad,
      stt: this.stt,
      // Resolved per-turn inside the session so a mid-session flag flip swaps providers.
      resolveTts: () => this.ttsRouter.forGuild(guildId),
      // Voice turns use the lighter voice_model and the spoken-mode prompt, not the text-chat config.
      resolveTurnConfig: async () => ({
        modelId: await this.personality.getVoiceModel(guildId),
        instructions: await this.personality.getSystemPrompt('voice', guildId),
      }),
      agent,
      useMemory,
      supabase: this.supabase,
      onDestroy: () => this.sessions.delete(guildId),
    });

    this.sessions.set(guildId, session);
    session.start();
    void session.greet();

    this.logger.log(`[VoiceMgr] joined #${channel.name} in guild=${guildId}`);
    return session;
  }

  /** Leave the voice channel for a guild. */
  async leave(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) return;
    await session.destroy();
    this.logger.log(`[VoiceMgr] left voice channel for guild=${guildId}`);
  }

  /** Is the bot currently in a voice channel for this guild? */
  isActive(guildId: string): boolean {
    return this.sessions.has(guildId);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(`[VoiceMgr] destroying ${this.sessions.size} active sessions`);
    await Promise.all([...this.sessions.values()].map((s) => s.destroy()));
    this.sessions.clear();
  }
}
