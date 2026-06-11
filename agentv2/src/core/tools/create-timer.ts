/**
 * create_timer tool — schedule a countdown timer.
 *
 * Delivery (sending the Discord message when the timer fires) is handled
 * via the TimerPort interface, implemented in infra/discord-timer.service.ts.
 * This keeps core/ free of Discord and NestJS imports.
 *
 * Boundary: no NestJS, no Discord imports.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ── Constants (mirrors v1 TIMER config) ───────────────────────────────────────

const POPEYES_BASE_MIN = 10;
const POPEYES_RAND_MIN = 2;
const POPEYES_RAND_MAX = 15;
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 1440; // 24h
const MAX_REMINDER_LEN = 200;

/** Per-user: max 3 active timers in a 10-minute window. */
const TIMER_RATE_LIMIT = 3;
const TIMER_RATE_WINDOW_MS = 10 * 60 * 1000;
const timerCreations = new Map<string, number[]>();

function checkTimerLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const ts = (timerCreations.get(userId) ?? []).filter((t) => now - t < TIMER_RATE_WINDOW_MS);
  if (ts.length >= TIMER_RATE_LIMIT) {
    const oldest = ts[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((oldest + TIMER_RATE_WINDOW_MS - now) / 1000),
    };
  }
  ts.push(now);
  timerCreations.set(userId, ts);
  return { allowed: true };
}

function formatDuration(minutes: number): string {
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return '1 hour';
  return `${Math.round(minutes / 60)} hours`;
}

// ── Port ─────────────────────────────────────────────────────────────────────

/** Implemented by DiscordTimerService in infra/ — keeps Discord out of core. */
export interface TimerPort {
  schedule(opts: TimerOpts): void;
}

export interface TimerOpts {
  channelId: string;
  userId: string;
  guildId: string | null;
  reminderMessage: string;
  replyInChannel: boolean;
  durationMs: number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createTimerTool(description: string, timerPort: TimerPort) {
  return createTool({
    id: 'create_timer',
    description,
    inputSchema: z.object({
      channelId: z.string().describe('Discord channel ID to post the reminder in.'),
      userId: z.string().describe('Discord user ID who requested the timer.'),
      guildId: z.string().nullable().describe('Discord guild ID (null for DMs).'),
      durationMinutes: z
        .number()
        .min(0)
        .max(MAX_DURATION_MIN)
        .describe(
          'Duration in minutes (1–1440). Pass 0 if the user did not say how long, or if isPopeyesTimer is true.',
        ),
      isPopeyesTimer: z
        .boolean()
        .describe(
          "True when the user says it's a Popeyes timer. Uses 10 min + random 2–15 min.",
        ),
      reminderMessage: z
        .string()
        .describe('Optional reminder text. Pass empty string if none.'),
      replyInChannel: z
        .boolean()
        .describe('True to post in the channel; false to DM the user.'),
    }),

    execute: async (inputData) => {
      const {
        channelId,
        userId,
        guildId,
        durationMinutes,
        isPopeyesTimer,
        reminderMessage,
        replyInChannel,
      } = inputData as {
        channelId: string;
        userId: string;
        guildId: string | null;
        durationMinutes: number;
        isPopeyesTimer: boolean;
        reminderMessage: string;
        replyInChannel: boolean;
      };

      // Rate limit
      const limit = checkTimerLimit(userId);
      if (!limit.allowed) {
        return {
          success: false,
          error: `Too many timers. Try again in ${limit.retryAfterSeconds ?? '?'} seconds.`,
        };
      }

      // Resolve duration
      let durationMin: number;
      if (isPopeyesTimer) {
        durationMin =
          POPEYES_BASE_MIN +
          POPEYES_RAND_MIN +
          Math.floor(Math.random() * (POPEYES_RAND_MAX - POPEYES_RAND_MIN + 1));
      } else if (!durationMinutes || durationMinutes <= 0) {
        return {
          success: false,
          error: 'How many minutes?',
          hint: 'Ask the user how long they want the timer.',
        };
      } else {
        durationMin = Math.max(
          MIN_DURATION_MIN,
          Math.min(MAX_DURATION_MIN, Math.round(durationMinutes)),
        );
      }

      const reminderFinal =
        typeof reminderMessage === 'string' && reminderMessage.trim().length > 0
          ? reminderMessage.trim().slice(0, MAX_REMINDER_LEN)
          : '';

      timerPort.schedule({
        channelId,
        userId,
        guildId: guildId ?? null,
        reminderMessage: reminderFinal,
        replyInChannel: Boolean(replyInChannel),
        durationMs: durationMin * 60 * 1000,
      });

      const label = formatDuration(durationMin);
      const prefix = isPopeyesTimer ? 'Popeyes timer set for ' : 'Timer set for ';
      return {
        success: true,
        durationMinutes: durationMin,
        isPopeyesTimer,
        message: `${prefix}${label}. I'll hit you back then.${reminderFinal ? ` Reminder: ${reminderFinal}` : ''}`,
      };
    },
  });
}
