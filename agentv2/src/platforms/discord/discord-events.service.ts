import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Once, On, Context, type ContextOf } from 'necord';
import type { Message } from 'discord.js';
import { MentionService } from './mention.service.js';

/**
 * Discord gateway event handlers.
 *
 * This service is intentionally thin — it filters events and delegates
 * to domain services. No business logic lives here.
 *
 * onReady    → log bot identity
 * onMessage  → filter (bot / no-mention) then delegate to MentionService
 */
@Injectable()
export class DiscordEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(DiscordEventsService.name);

  constructor(private readonly mentionService: MentionService) {}

  @Once('clientReady')
  onReady(@Context() [client]: ContextOf<'clientReady'>): void {
    this.logger.log(`✅ Bot connected as ${client.user.tag}`);
  }

  @On('messageCreate')
  onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>): void {
    if (message.author.bot) return;
    if (!message.client.user) return;
    if (!message.mentions.has(message.client.user)) return;

    void this.mentionService.handle(message as unknown as Message);
  }

  onModuleDestroy(): void {
    this.logger.log('Discord events service destroyed — bot disconnecting.');
  }
}
