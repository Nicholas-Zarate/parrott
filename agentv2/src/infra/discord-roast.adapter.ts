/**
 * DiscordRoastAdapter — implements RoastDataPort for Discord.
 *
 * Fetches a guild member's display name. Full activity/message data
 * collection comes in Task 6.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from 'discord.js';
import type { RoastDataPort } from '../core/tools/run-roast.js';

@Injectable()
export class DiscordRoastAdapter implements RoastDataPort {
  private readonly logger = new Logger(DiscordRoastAdapter.name);

  constructor(@Inject(Client) private readonly client: Client) {}

  async getDisplayName(guildId: string, userId: string): Promise<string | null> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      return member.displayName ?? member.user.username ?? null;
    } catch (err) {
      this.logger.debug(`getDisplayName failed guild=${guildId} user=${userId}: ${String(err)}`);
      return null;
    }
  }
}
