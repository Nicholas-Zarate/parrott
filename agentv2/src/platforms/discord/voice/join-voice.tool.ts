/**
 * join_voice tool — Discord-only tool that makes the bot join a voice channel.
 *
 * Platform-specific: lives in platforms/discord/voice/, NOT in core/tools/
 * (core/ may not import Discord). Registered late via
 * ParrottAgentProvider.registerTool() from VoiceSessionManager.onModuleInit().
 *
 * The user must be in a voice channel. The bot joins theirs.
 * If already in a voice channel for this guild, returns current status.
 *
 * guildId + userId come from the [discord:guild=…,user=…] context prefix
 * prepended by MentionService — the LLM cannot know these from message text alone.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import { PermissionsBitField, type VoiceChannel, type StageChannel } from 'discord.js';
import type { VoiceSessionManager } from './voice-session.manager.js';
import type { Client } from 'discord.js';

const logger = new Logger('JoinVoiceTool');

export function createJoinVoiceTool(
  manager: VoiceSessionManager,
  discordClient: Client,
) {
  return createTool({
    id: 'join_voice',
    description:
      'Join the voice channel the requesting user is currently in. Use when someone asks the bot to join voice, hop in vc, or similar.',
    inputSchema: z.object({
      guildId: z.string().describe('Discord guild (server) ID — from the discord context prefix'),
      userId: z.string().describe('Discord user ID of the person who invoked the tool — from the discord context prefix'),
    }),
    execute: async (inputData) => {
      const { guildId, userId } = inputData as { guildId: string; userId: string };
      logger.log(`join_voice called: guild=${guildId} user=${userId}`);

      try {
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
          logger.warn(`join_voice: guild ${guildId} not in cache`);
          return { success: false, message: 'Server not found — make sure I have the right guild ID.' };
        }

        const member = await guild.members.fetch(userId).catch((err) => {
          logger.warn(`join_voice: member fetch failed for ${userId}: ${String(err)}`);
          return null;
        });

        const channel = member?.voice?.channel as VoiceChannel | StageChannel | null | undefined;

        if (!channel) {
          logger.log(`join_voice: user ${userId} not in a voice channel`);
          return { success: false, message: "You're not in a voice channel — join one first!" };
        }

        logger.log(`join_voice: target channel #${channel.name} (${channel.id})`);

        // Permission check before attempting join
        const botMember = guild.members.me;
        if (botMember) {
          const perms = channel.permissionsFor(botMember);
          if (!perms?.has(PermissionsBitField.Flags.Connect)) {
            logger.warn(`join_voice: missing Connect permission on #${channel.name}`);
            return { success: false, message: `I don't have permission to join #${channel.name}. Give me Connect access and try again.` };
          }
          if (!perms.has(PermissionsBitField.Flags.Speak)) {
            logger.warn(`join_voice: missing Speak permission on #${channel.name}`);
            return { success: false, message: `I can join #${channel.name} but I don't have Speak permission there — I'd be a mute parrot.` };
          }
        }

        if (manager.isActive(guildId)) {
          logger.log(`join_voice: already active in guild=${guildId}`);
          return { success: true, message: 'Already in a voice channel on this server.' };
        }

        await manager.join(channel, guild);
        logger.log(`join_voice: joined #${channel.name} successfully`);
        return { success: true, message: `Joined #${channel.name}! Say "hey mister parrot" to wake me up.` };
      } catch (err) {
        logger.error(`join_voice: unexpected error: ${String(err)}`);
        return { success: false, message: `Couldn't join: ${String(err)}` };
      }
    },
  });
}
