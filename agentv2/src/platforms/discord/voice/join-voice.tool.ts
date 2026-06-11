/**
 * join_voice tool — Discord-only tool that makes the bot join a voice channel.
 *
 * Platform-specific: lives in platforms/discord/voice/, NOT in core/tools/
 * (core/ may not import Discord). Registered late via
 * ParrottAgentProvider.registerTool() from VoiceModule.onModuleInit().
 *
 * The user must be in a voice channel. The bot joins theirs.
 * If already in a voice channel for this guild, returns current status.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { VoiceSessionManager } from './voice-session.manager.js';
import type { Client } from 'discord.js';

export function createJoinVoiceTool(
  manager: VoiceSessionManager,
  discordClient: Client,
) {
  return createTool({
    id: 'join_voice',
    description:
      'Join the voice channel the requesting user is currently in. Use when someone asks the bot to join voice, hop in vc, or similar.',
    inputSchema: z.object({
      guildId: z.string().describe('Discord guild (server) ID'),
      userId: z.string().describe('Discord user ID of the person who invoked the tool'),
    }),
    execute: async (inputData) => {
      const { guildId, userId } = inputData as { guildId: string; userId: string };
      try {
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return { success: false, message: 'Server not found.' };

        const member = await guild.members.fetch(userId).catch(() => null);
        const channel = member?.voice?.channel;

        if (!channel) {
          return { success: false, message: "You're not in a voice channel — join one first!" };
        }

        if (manager.isActive(guildId)) {
          return { success: true, message: `Already in a voice channel on this server.` };
        }

        await manager.join(channel as Parameters<typeof manager.join>[0], guild);
        return { success: true, message: `Joined #${channel.name}! Say "parrot" to wake me up.` };
      } catch (err) {
        return { success: false, message: `Couldn't join: ${String(err)}` };
      }
    },
  });
}
