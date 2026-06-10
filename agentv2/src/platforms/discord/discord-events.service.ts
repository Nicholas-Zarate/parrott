import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Once, On, Context, type ContextOf } from 'necord';
import { Agent } from '@mastra/core/agent';
import type { Client } from 'discord.js';

/**
 * Discord event handlers — stub implementations for Task 1 (scaffold + ESM proof).
 *
 * ESM proof: `import { Agent } from '@mastra/core/agent'` works inside NestJS
 * with moduleResolution: nodenext. The Agent class is logged on ready to confirm.
 *
 * Full implementations land in Task 2 (agent) and Task 3 (mention adapter).
 */
@Injectable()
export class DiscordEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(DiscordEventsService.name);
  private client: Client | null = null;

  @Once('ready')
  onReady(@Context() [client]: ContextOf<'ready'>): void {
    this.client = client;
    this.logger.log(`✅ Bot connected as ${client.user.tag}`);

    // ── ESM proof gate ─────────────────────────────────────────────────────
    // If @mastra/core/agent failed to resolve, this line would have thrown at
    // module load time (before 'ready' fires). Reaching here = ✅ ESM works.
    this.logger.debug(
      `Mastra Agent class loaded: ${Agent.name} (ESM proof ✅)`,
    );
  }

  @On('messageCreate')
  onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>): void {
    // Ignore bots and messages that don't mention us
    if (message.author.bot) return;
    if (!message.mentions.has(message.client.user!)) return;

    // Stub log — full implementation in Task 3 (mention adapter)
    this.logger.log(
      `[stub] @mention from ${message.author.tag} ` +
        `in #${message.channelId} | content: "${message.content.slice(0, 80)}"`,
    );
  }

  onModuleDestroy(): void {
    // Necord manages the client lifecycle; this is a belt-and-suspenders log.
    // Actual client.destroy() is called by Necord's own OnModuleDestroy.
    this.logger.log('Discord events service destroyed — bot disconnecting.');
  }
}
