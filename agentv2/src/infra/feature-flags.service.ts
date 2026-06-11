/**
 * FeatureFlagService — reads parrot_feature_flags with a 45-second TTL cache
 * per guild. Guild-specific flags override 'default' flags.
 *
 * A flag is "live" only when: enabled === true AND status === 'live'.
 */

import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase/supabase.module.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface FlagRow {
  key: string;
  enabled: boolean;
  status: string;
}

interface CachedFlags {
  flags: Map<string, FlagRow>;
  expiresAt: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly TTL_MS = 45_000;

  /** Per-guild flag cache. Key = guildId (or 'default'). */
  private readonly cacheByGuild = new Map<string, CachedFlags>();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureCache('default');
      this.logger.log(
        `Feature flags cached (${this.cacheByGuild.get('default')?.flags.size ?? 0} flags)`,
      );
    } catch (err) {
      this.logger.warn(`Feature flags cache warm failed: ${String(err)}`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Synchronous check. Safe to call on every message — refreshes in background
   * when stale. Guild-specific flag overrides 'default' when present.
   */
  isLive(key: string, guildId = 'default'): boolean {
    const entry = this.cacheByGuild.get(guildId);
    if (!entry || Date.now() >= entry.expiresAt) {
      void this.ensureCache(guildId);
    }
    const flag = entry?.flags.get(key);
    return flag ? flag.enabled && flag.status === 'live' : false;
  }

  /**
   * Async variant — awaits a fresh fetch if the cache is expired.
   */
  async isLiveAsync(key: string, guildId = 'default'): Promise<boolean> {
    await this.ensureCache(guildId);
    const flag = this.cacheByGuild.get(guildId)?.flags.get(key);
    return flag ? flag.enabled && flag.status === 'live' : false;
  }

  /**
   * Bust the cache.
   * - invalidate(guildId) → one guild.
   * - invalidate()        → all guilds.
   */
  invalidate(guildId?: string): void {
    if (guildId) {
      this.cacheByGuild.delete(guildId);
      this.logger.log(`Feature flags cache invalidated (guild=${guildId})`);
    } else {
      this.cacheByGuild.clear();
      this.logger.log('Feature flags cache invalidated (all guilds)');
    }
  }

  // ── Cache internals ────────────────────────────────────────────────────────

  private async ensureCache(guildId: string): Promise<void> {
    const entry = this.cacheByGuild.get(guildId);
    if (entry && Date.now() < entry.expiresAt) return;

    const guildFilter = guildId === 'default' ? ['default'] : [guildId, 'default'];

    const { data, error } = await this.supabase
      .from('parrot_feature_flags')
      .select('key, enabled, status, guild_id')
      .in('guild_id', guildFilter);

    if (error) {
      this.logger.error(`parrot_feature_flags fetch error: ${error.message}`);
      // Short retry window so we don't hammer Supabase
      this.cacheByGuild.set(guildId, {
        flags: entry?.flags ?? new Map(),
        expiresAt: Date.now() + 5_000,
      });
      return;
    }

    // Build merged flags: 'default' first, guild-specific overrides
    const flags = new Map<string, FlagRow>();
    for (const row of (data ?? []).filter(r => r.guild_id === 'default')) {
      flags.set(row.key as string, {
        key: row.key as string,
        enabled: (row.enabled as boolean) ?? false,
        status: (row.status as string) ?? 'planned',
      });
    }
    for (const row of (data ?? []).filter(r => r.guild_id === guildId)) {
      flags.set(row.key as string, {
        key: row.key as string,
        enabled: (row.enabled as boolean) ?? false,
        status: (row.status as string) ?? 'planned',
      });
    }

    this.cacheByGuild.set(guildId, { flags, expiresAt: Date.now() + this.TTL_MS });
    this.logger.log(`Feature flags cached (guild=${guildId}, ${flags.size} flags)`);
  }
}
