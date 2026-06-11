/**
 * AllowlistService — channel allowlist + tier resolution, 45s TTL cache.
 *
 * Gated behind the 'capability.channel_allowlist' feature flag:
 *   - Flag not live (default) → respond everywhere, tier = 'unlimited'
 *   - Flag live, channel in list → use that channel's tier
 *   - Flag live, channel NOT in list → block (return allowed: false)
 *
 * Tiers control rate limiting in RateLimitService:
 *   unlimited — no rate limit
 *   semi      — 5 per 2 min per user
 *   limited   — 4 per 5 min per user
 */

import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase/supabase.module.js';
import { FeatureFlagService } from './feature-flags.service.js';

export type ChannelTier = 'unlimited' | 'semi' | 'limited';

export interface AllowlistResult {
  allowed: boolean;
  tier: ChannelTier;
}

interface AllowlistRow {
  channel_id: string;
  guild_id: string;
  tier: ChannelTier;
  is_active: boolean;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AllowlistService implements OnModuleInit {
  private readonly logger = new Logger(AllowlistService.name);
  private readonly TTL_MS = 45_000;

  /** key = `${channelId}:${guildId}` */
  private cache: Map<string, AllowlistRow> = new Map();
  private expiresAt = 0;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly flags: FeatureFlagService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureCache();
      this.logger.log(`Allowlist cache warmed (${this.cache.size} entries)`);
    } catch (err) {
      this.logger.warn(`Allowlist cache warm failed: ${String(err)}`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve whether the bot should respond in this channel and at what tier.
   * Safe to call on every message — served from cache.
   */
  async check(channelId: string, guildId: string): Promise<AllowlistResult> {
    // When the feature flag is off (default), respond everywhere freely.
    if (!this.flags.isLive('capability.channel_allowlist', guildId)) {
      return { allowed: true, tier: 'unlimited' };
    }

    await this.ensureCache();

    const key = `${channelId}:${guildId}`;
    const row = this.cache.get(key);

    if (!row || !row.is_active) {
      // Channel not in allowlist → silently ignore
      return { allowed: false, tier: 'semi' };
    }

    return { allowed: true, tier: row.tier };
  }

  /** Force-bust the cache (called by control endpoint in Task 7). */
  invalidate(): void {
    this.expiresAt = 0;
    this.logger.log('Allowlist cache invalidated');
  }

  // ── Cache internals ────────────────────────────────────────────────────────

  private async ensureCache(): Promise<void> {
    if (Date.now() < this.expiresAt) return;

    const { data, error } = await this.supabase
      .from('parrot_channel_allowlist')
      .select('channel_id, guild_id, tier, is_active');

    if (error) {
      this.logger.error(`parrot_channel_allowlist fetch error: ${error.message}`);
      this.expiresAt = Date.now() + 5_000;
      return;
    }

    const updated = new Map<string, AllowlistRow>();
    for (const row of data ?? []) {
      const key = `${row.channel_id}:${row.guild_id}`;
      updated.set(key, row as AllowlistRow);
    }

    this.cache = updated;
    this.expiresAt = Date.now() + this.TTL_MS;
  }
}
