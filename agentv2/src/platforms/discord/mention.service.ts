/**
 * MentionService — full @mention pipeline.
 *
 * Pipeline (in order):
 *   1. Blocked-role gate     → polite rejection
 *   2. Channel allowlist     → silent ignore if not allowed
 *   3. Rate limit            → resting message with live countdown
 *   4. Placeholder reply     → 'juan second...'
 *   5. Agent call            → generate with memory if live
 *   6. Edit placeholder      → final reply
 *   7. Save conversation     → parrot_conversation_history (fire-and-forget)
 *   8. Error fallback        → friendly message on agent failure
 *
 * The Discord Message object never leaves this file — core receives only plain types.
 */

import { Injectable, Logger, Inject, OnModuleDestroy } from '@nestjs/common';
import type { GuildMember, Message } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../infra/supabase/supabase.module.js';
import { AllowlistService, type ChannelTier } from '../../infra/allowlist.service.js';
import { RateLimitService } from '../../infra/rate-limit.service.js';
import { ParrottAgentProvider, guildContext } from '../../infra/parrott-agent.provider.js';
import { buildMemoryScope } from '../../core/memory/scope.js';

// ── Blocked-role config ───────────────────────────────────────────────────────

/**
 * Parsed once at module load from BLOCKED_DISCORD_ROLE_NAMES (comma-separated,
 * case-insensitive). Matches v1's agent/abilities/restricted-roles.js behaviour.
 */
const BLOCKED_ROLE_NAMES: string[] = (
  process.env['BLOCKED_DISCORD_ROLE_NAMES'] ?? ''
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function hasBlockedRole(member: GuildMember): boolean {
  if (BLOCKED_ROLE_NAMES.length === 0) return false;
  for (const [, role] of member.roles.cache) {
    const name = role?.name?.trim().toLowerCase() ?? '';
    if (name && BLOCKED_ROLE_NAMES.includes(name)) return true;
  }
  return false;
}

// ── Text extraction ───────────────────────────────────────────────────────────

/** Strip the bot's @mention from the message content. */
function extractText(message: Message): string {
  const clientUserId = message.client.user?.id ?? '';
  const text = message.content
    .replace(new RegExp(`<@!?${clientUserId}>`, 'g'), '')
    .trim();
  return text || '(no content)';
}

// ── Resting message ───────────────────────────────────────────────────────────

const COUNTDOWN_INTERVAL_MS = 15_000;

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MentionService implements OnModuleDestroy {
  private readonly logger = new Logger(MentionService.name);
  /** Active countdown intervals — cleared on shutdown to avoid Discord API calls after disconnect. */
  private readonly activeIntervals = new Set<ReturnType<typeof setInterval>>();

  constructor(
    private readonly allowlist: AllowlistService,
    private readonly rateLimiter: RateLimitService,
    private readonly agentProvider: ParrottAgentProvider,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async handle(message: Message): Promise<void> {
    const { channelId, guildId, author, guild } = message;
    const authorTag = `${author.username}#${author.discriminator}`;
    this.logger.log(
      `[Mention] #${channelId} @${authorTag}: "${message.content.slice(0, 80)}"`,
    );

    // ── Gate 1: Blocked role ─────────────────────────────────────────────────
    if (guild) {
      const member =
        message.member ??
        (await guild.members.fetch(author.id).catch(() => null));
      if (member && hasBlockedRole(member)) {
        await message
          .reply('only full members can use the parrot here, no cap.')
          .catch(() => null);
        return;
      }
    }

    // ── Gate 2: Channel allowlist + tier ─────────────────────────────────────
    const { allowed, tier } = await this.allowlist.check(
      channelId,
      guildId ?? '',
    );
    if (!allowed) {
      this.logger.debug(
        `[Mention] Ignored — channel ${channelId} not in allowlist`,
      );
      return;
    }

    // ── Gate 3: Rate limit ───────────────────────────────────────────────────
    const rl = this.rateLimiter.checkAndRecord(author.id, tier);
    if (!rl.allowed) {
      this.logger.log(
        `[Mention] Rate limited ${author.id} (tier=${tier}), retry in ${rl.retryAfterSeconds}s`,
      );
      await this.sendRestingMessage(message, rl.retryAfterSeconds!, author.id, tier);
      return;
    }

    // ── Gate 4: Personality sanity check ────────────────────────────────────
    // (PersonalityService.getSystemPrompt falls back gracefully; agent will
    //  still run. No need to gate here — trust the service fallback.)

    // ── Placeholder ──────────────────────────────────────────────────────────
    let placeholder: Message;
    try {
      placeholder = await message.reply('juan second...');
    } catch (err) {
      this.logger.error(`[Mention] Failed to send placeholder: ${String(err)}`);
      return;
    }

    // ── Agent call ───────────────────────────────────────────────────────────
    try {
      const text = extractText(message);
      const agent = this.agentProvider.getAgent();
      const useMemory = this.agentProvider.isMemoryLive(guildId ?? 'default');
      const { threadId, resourceId } = buildMemoryScope(channelId, author.id);

      // guildContext.run() threads guildId into the instructions/model closures
      // so personality and model resolve per-guild without API changes.
      const result = await guildContext.run(guildId ?? 'default', () =>
        agent.generate(
          [{ role: 'user', content: text }],
          useMemory ? { memory: { thread: threadId, resource: resourceId } } : {},
        ),
      );

      const reply = result.text?.trim() || 'SQUAWK.';
      const toolsCalled: string[] = (result.toolCalls ?? []).map(
        (tc) => tc.payload.toolName,
      );

      // ── Edit placeholder ─────────────────────────────────────────────────
      await placeholder.edit(reply).catch((err) => {
        this.logger.warn(`[Mention] Edit failed: ${String(err)}`);
      });

      this.logger.log(
        `[Mention] ✅ @${authorTag} → ${reply.length} chars` +
          (toolsCalled.length ? ` | tools: ${toolsCalled.join(', ')}` : ''),
      );

      // ── Save conversation history ────────────────────────────────────────
      void this.saveConversation({
        previous_message_id: message.id,
        reply_message_id: placeholder.id,
        channel_id: channelId,
        guild_id: guildId ?? null,
        user_text: text,
        response_text: reply,
        tools_called: toolsCalled,
      });
    } catch (err) {
      this.logger.error(`[Mention] Agent error: ${String(err)}`);
      await placeholder
        .edit('something went wrong on my end. try again in a bit.')
        .catch(() => null);
    }
  }

  onModuleDestroy(): void {
    const count = this.activeIntervals.size;
    for (const id of this.activeIntervals) {
      clearInterval(id);
    }
    this.activeIntervals.clear();
    this.logger.log(`MentionService destroyed — cleared ${count} active countdown intervals`);
  }

  // ── Resting message ────────────────────────────────────────────────────────

  private async sendRestingMessage(
    message: Message,
    initialSeconds: number,
    userId: string,
    tier: ChannelTier,
  ): Promise<void> {
    const restingMsg = `juan second fam, i'm resting (wait ${RateLimitService.plural(initialSeconds)} ninja)`;

    const replyMsg = await message.reply(restingMsg).catch(() => null);
    if (!replyMsg) return;

    const intervalId = setInterval(async () => {
      const secondsLeft = this.rateLimiter.retryAfterSeconds(userId, tier);
      if (secondsLeft <= 0) {
        clearInterval(intervalId);
        this.activeIntervals.delete(intervalId);
        await replyMsg
          .edit('juan second fam, you can try again now.')
          .catch(() => {});
        return;
      }
      await replyMsg
        .edit(
          `juan second fam, i'm resting (wait ${RateLimitService.plural(secondsLeft)} ninja)`,
        )
        .catch(() => {
          clearInterval(intervalId);
          this.activeIntervals.delete(intervalId);
        });
    }, COUNTDOWN_INTERVAL_MS);

    this.activeIntervals.add(intervalId);
  }

  // ── Conversation history ───────────────────────────────────────────────────

  private async saveConversation(row: {
    previous_message_id: string;
    reply_message_id: string;
    channel_id: string;
    guild_id: string | null;
    user_text: string;
    response_text: string;
    tools_called: string[];
  }): Promise<void> {
    const { error } = await this.supabase
      .from('parrot_conversation_history')
      .insert(row);

    if (error) {
      this.logger.warn(
        `[Mention] conversation_history insert failed: ${error.message}`,
      );
    }
  }
}
