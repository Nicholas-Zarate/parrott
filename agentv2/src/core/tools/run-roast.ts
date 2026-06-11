/**
 * run_roast tool — roast a crew member.
 *
 * The tool resolves who to roast and returns target info.
 * The agent (with its personality instructions) generates the actual roast.
 *
 * For user ID targets: uses RoastDataPort to fetch the display name.
 * Full activity/message data collection comes in Task 6.
 *
 * Boundary: no NestJS, no Discord imports.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ── Port ─────────────────────────────────────────────────────────────────────

/**
 * Implemented by DiscordRoastAdapter in infra/ — resolves Discord display names
 * without importing discord.js into core.
 */
export interface RoastDataPort {
  getDisplayName(guildId: string, userId: string): Promise<string | null>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createRunRoastTool(description: string, roastData: RoastDataPort) {
  return createTool({
    id: 'run_roast',
    description,
    inputSchema: z.object({
      targetUserId: z
        .string()
        .optional()
        .describe(
          "Discord user ID when the user @mentioned someone (e.g. 'roast @Harol' — pass the mentioned user's ID).",
        ),
      targetUserName: z
        .string()
        .optional()
        .describe(
          "Plain name when no @mention (e.g. 'roast Harol' — pass 'Harol').",
        ),
      guildId: z
        .string()
        .optional()
        .describe('Discord guild ID — used to look up the target member display name.'),
    }),

    execute: async (inputData) => {
      const { targetUserId, targetUserName, guildId } = inputData as {
        targetUserId?: string;
        targetUserName?: string;
        guildId?: string;
      };

      const hasId = typeof targetUserId === 'string' && targetUserId.trim().length > 0;
      const hasName = typeof targetUserName === 'string' && targetUserName.trim().length > 0;

      if (!hasId && !hasName) {
        return {
          success: false,
          error: 'Provide either targetUserId (from @mention) or targetUserName (plain name).',
        };
      }

      // Name-only path — no Discord lookup needed
      if (!hasId && hasName) {
        return {
          success: true,
          targetName: targetUserName!.trim(),
          context: 'name_only',
          instruction: `Roast ${targetUserName!.trim()} in your most savage, crew-appropriate style.`,
        };
      }

      // User ID path — resolve display name via port
      let displayName: string | null = null;
      if (guildId) {
        displayName = await roastData.getDisplayName(guildId, targetUserId!.trim()).catch(() => null);
      }

      const name = displayName ?? targetUserName?.trim() ?? `<@${targetUserId}>`;

      return {
        success: true,
        targetName: name,
        targetUserId: targetUserId!.trim(),
        context: 'user_id',
        instruction: `Roast ${name} in your most savage, crew-appropriate style.`,
      };
    },
  });
}
