/**
 * DiscordTimerService — implements TimerPort for Discord delivery.
 *
 * Uses setTimeout to schedule the timer, then sends a Discord message
 * when it fires. Tracks active timeouts and clears them on shutdown.
 */

import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'discord.js';
import type { TextChannel, DMChannel } from 'discord.js';
import type { TimerPort, TimerOpts } from '../core/tools/create-timer.js';

@Injectable()
export class DiscordTimerService implements TimerPort, OnModuleDestroy {
  private readonly logger = new Logger(DiscordTimerService.name);
  private readonly activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  constructor(@Inject(Client) private readonly client: Client) {}

  schedule(opts: TimerOpts): void {
    const { channelId, userId, reminderMessage, replyInChannel, durationMs } = opts;

    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId);
      void this.deliver({ channelId, userId, reminderMessage, replyInChannel });
    }, durationMs);

    this.activeTimeouts.add(timeoutId);
    this.logger.log(
      `Timer scheduled: userId=${userId} channel=${channelId} durationMs=${durationMs}`,
    );
  }

  onModuleDestroy(): void {
    const count = this.activeTimeouts.size;
    for (const id of this.activeTimeouts) clearTimeout(id);
    this.activeTimeouts.clear();
    this.logger.log(`DiscordTimerService destroyed — cleared ${count} active timers`);
  }

  private async deliver(opts: {
    channelId: string;
    userId: string;
    reminderMessage: string;
    replyInChannel: boolean;
  }): Promise<void> {
    const { channelId, userId, reminderMessage, replyInChannel } = opts;
    const suffix = reminderMessage ? ` — ${reminderMessage}` : '';
    const text = `<@${userId}> ⏰ time's up${suffix}`;

    if (replyInChannel) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (channel && 'send' in channel) {
          await (channel as TextChannel).send(text);
        }
      } catch (err) {
        this.logger.warn(`Timer delivery to channel ${channelId} failed: ${String(err)}`);
        // Fall through to DM
        await this.dmUser(userId, text);
      }
    } else {
      await this.dmUser(userId, text);
    }
  }

  private async dmUser(userId: string, text: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      const dm = (await user.createDM()) as DMChannel;
      await dm.send(text);
    } catch (err) {
      this.logger.warn(`Timer DM to user ${userId} failed: ${String(err)}`);
    }
  }
}
