/**
 * RateLimitService — in-memory per-user rate limiter.
 *
 * Direct port of v1's agent/abilities/mention/rateLimit.js:
 *   unlimited — no limit
 *   semi      — 5 mentions per 2 minutes
 *   limited   — 4 mentions per 5 minutes
 *
 * Blocked attempts are NOT recorded (don't extend the window).
 * State is in-process — resets on restart (fine for a friend-group bot).
 */

import { Injectable } from '@nestjs/common';
import type { ChannelTier } from './allowlist.service.js';

interface TierConfig {
  windowMs: number;
  maxMentions: number;
}

const TIER_CONFIG: Record<Exclude<ChannelTier, 'unlimited'>, TierConfig> = {
  semi: { windowMs: 2 * 60 * 1000, maxMentions: 5 },
  limited: { windowMs: 5 * 60 * 1000, maxMentions: 4 },
};

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the user can send again. Only set when allowed=false. */
  retryAfterSeconds?: number;
}

@Injectable()
export class RateLimitService {
  /** key = `${userId}|${tier}` → sorted list of timestamps in current window */
  private readonly timestamps = new Map<string, number[]>();

  /**
   * Check whether this user is within the rate limit for the given tier.
   * Records the attempt if allowed; does NOT record if blocked.
   */
  checkAndRecord(userId: string, tier: ChannelTier): RateLimitResult {
    if (tier === 'unlimited') return { allowed: true };

    const config = TIER_CONFIG[tier];
    const key = `${userId}|${tier}`;
    const now = Date.now();

    let ts = (this.timestamps.get(key) ?? []).filter(
      (t) => now - t < config.windowMs,
    );

    if (ts.length >= config.maxMentions) {
      const oldest = ts[0]!;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + config.windowMs - now) / 1000),
      );
      // Don't record — blocked attempts don't extend the window.
      this.timestamps.set(key, ts);
      return { allowed: false, retryAfterSeconds };
    }

    ts.push(now);
    this.timestamps.set(key, ts);
    return { allowed: true };
  }

  /**
   * Remaining seconds until the user is under the limit again.
   * Returns 0 if they're currently allowed.
   */
  retryAfterSeconds(userId: string, tier: ChannelTier): number {
    if (tier === 'unlimited') return 0;
    const config = TIER_CONFIG[tier];
    const key = `${userId}|${tier}`;
    const now = Date.now();
    const ts = (this.timestamps.get(key) ?? []).filter(
      (t) => now - t < config.windowMs,
    );
    if (ts.length < config.maxMentions) return 0;
    const oldest = ts[0]!;
    return Math.max(0, Math.ceil((oldest + config.windowMs - now) / 1000));
  }

  /** Pluralise seconds for the resting message (matches v1 output). */
  static plural(seconds: number): string {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
}
