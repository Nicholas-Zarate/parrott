/**
 * PersonalityService — resolves Parrott's system prompt and model from the
 * live parrot_* Supabase tables, with a 45-second TTL cache per guild.
 *
 * Fetch strategy: guild-specific rows override 'default' rows.
 * A guild with no custom rows gets pure 'default' behaviour — no data needed
 * in the DB for each guild before it can work.
 *
 * Dashboard edits flow through within ~45s (cache TTL), no restart needed.
 */

import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase/supabase.module.js';
import {
  type ToneRow,
  type PromptSectionRow,
  type ToolMetaRow,
  type PersonalityContext,
  formatPersonalityMarkdown,
} from '../core/personality/personality-format.js';

// ── Cache types ──────────────────────────────────────────────────────────────

interface CachedData {
  tone: ToneRow;
  sections: PromptSectionRow[];
  tools: ToolMetaRow[];
  runtimeConfig: Map<string, string>;
}

interface CacheEntry {
  data: CachedData;
  expiresAt: number;
}

// ── Fallbacks (used when Supabase is unreachable at startup) ─────────────────

const FALLBACK_TONE: ToneRow = {
  roleName: 'default',
  voice: 'You are Parrott, a chaotic yet loyal AI who lives in the Discord server.',
  text: 'You are Parrott, a chaotic yet loyal AI who lives in the Discord server.',
  vc: '',
};

const FALLBACK_MODEL = 'openai/gpt-4o-mini';

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PersonalityService implements OnModuleInit {
  private readonly logger = new Logger(PersonalityService.name);
  private readonly TTL_MS = 45_000;

  /** Per-guild cache. Key = guildId (or 'default' for the global fallback). */
  private readonly cacheByGuild = new Map<string, CacheEntry>();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit(): Promise<void> {
    // Warm the 'default' cache at startup so the first request doesn't wait.
    try {
      await this.getCache('default');
      this.logger.log('Personality cache warmed (default)');
    } catch (err) {
      this.logger.warn(`Personality cache warm failed (using fallback): ${String(err)}`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the fully assembled system prompt for the given context and guild.
   * Guild-specific rows override 'default' rows; missing guild = pure 'default'.
   */
  async getSystemPrompt(
    context: PersonalityContext = 'text',
    guildId = 'default',
  ): Promise<string> {
    const { tone, sections, tools } = await this.getCache(guildId);
    return formatPersonalityMarkdown({ tone, sections, tools, context });
  }

  /** Primary text-chat model ID for this guild. */
  async getModel(guildId = 'default'): Promise<string> {
    const { runtimeConfig } = await this.getCache(guildId);
    return runtimeConfig.get('model') ?? FALLBACK_MODEL;
  }

  /** Voice-channel model ID for this guild. */
  async getVoiceModel(guildId = 'default'): Promise<string> {
    const { runtimeConfig } = await this.getCache(guildId);
    return runtimeConfig.get('voice_model') ?? FALLBACK_MODEL;
  }

  /** Full runtime config map for this guild. */
  async getRuntimeConfig(guildId = 'default'): Promise<Map<string, string>> {
    const { runtimeConfig } = await this.getCache(guildId);
    return runtimeConfig;
  }

  /**
   * Returns active tool descriptions for this guild.
   * Guild-specific rows override 'default' descriptions.
   */
  async getActiveToolDescriptions(guildId = 'default'): Promise<Map<string, string>> {
    const { tools } = await this.getCache(guildId);
    const map = new Map<string, string>();
    for (const t of tools) {
      if (t.is_active) map.set(t.tool_slug, t.description);
    }
    return map;
  }

  /**
   * Bust the cache.
   * - invalidate(guildId) → bust one guild's cache.
   * - invalidate()        → bust all guilds (e.g. on global config change).
   */
  invalidate(guildId?: string): void {
    if (guildId) {
      this.cacheByGuild.delete(guildId);
      this.logger.log(`Personality cache invalidated (guild=${guildId})`);
    } else {
      this.cacheByGuild.clear();
      this.logger.log('Personality cache invalidated (all guilds)');
    }
  }

  // ── Cache internals ────────────────────────────────────────────────────────

  private async getCache(guildId: string): Promise<CachedData> {
    const entry = this.cacheByGuild.get(guildId);
    if (entry && Date.now() < entry.expiresAt) return entry.data;

    const data = await this.fetchFromDb(guildId);
    this.cacheByGuild.set(guildId, { data, expiresAt: Date.now() + this.TTL_MS });
    return data;
  }

  /**
   * Fetches config for the given guild. Rows for both `guildId` and `'default'`
   * are fetched in a single query; guild-specific rows take precedence.
   * If guildId === 'default', only one set of rows is fetched.
   */
  private async fetchFromDb(guildId: string): Promise<CachedData> {
    const guildFilter = guildId === 'default' ? ['default'] : [guildId, 'default'];

    const [tonesRes, sectionsRes, toolsRes, configRes] = await Promise.all([
      this.supabase
        .from('parrot_tones')
        .select('role, voice, text, vc, guild_id')
        .in('guild_id', guildFilter)
        .eq('role', 'default'),

      this.supabase
        .from('parrot_prompt_sections')
        .select('key, content, enabled, sort_order, guild_id')
        .in('guild_id', guildFilter)
        .order('sort_order', { ascending: true }),

      this.supabase
        .from('tools_meta_data')
        .select('tool_slug, description, is_active, guild_id')
        .in('guild_id', guildFilter),

      this.supabase
        .from('parrot_runtime_config')
        .select('key, value, guild_id')
        .in('guild_id', guildFilter),
    ]);

    // ── Tone: guild-specific overrides 'default' ──────────────────────────
    let tone: ToneRow = FALLBACK_TONE;
    if (tonesRes.error) {
      this.logger.error(`parrot_tones fetch error: ${tonesRes.error.message}`);
    } else {
      const rows = tonesRes.data ?? [];
      const row = rows.find(r => r.guild_id === guildId) ?? rows.find(r => r.guild_id === 'default');
      if (row) {
        tone = {
          roleName: row.role as string,
          voice: (row.voice as string) ?? '',
          text: (row.text as string) ?? '',
          vc: (row.vc as string) ?? '',
        };
      }
    }

    // ── Sections: guild-specific rows override 'default' per key ──────────
    const sections: PromptSectionRow[] = [];
    if (sectionsRes.error) {
      this.logger.error(`parrot_prompt_sections fetch error: ${sectionsRes.error.message}`);
    } else {
      const byKey = new Map<string, PromptSectionRow>();
      // Add defaults first
      for (const row of (sectionsRes.data ?? []).filter(r => r.guild_id === 'default')) {
        byKey.set(row.key as string, {
          key: row.key as string,
          content: (row.content as string) ?? '',
          enabled: (row.enabled as boolean) ?? false,
          sort_order: (row.sort_order as number) ?? 0,
        });
      }
      // Guild-specific overrides
      for (const row of (sectionsRes.data ?? []).filter(r => r.guild_id === guildId)) {
        byKey.set(row.key as string, {
          key: row.key as string,
          content: (row.content as string) ?? '',
          enabled: (row.enabled as boolean) ?? false,
          sort_order: (row.sort_order as number) ?? 0,
        });
      }
      sections.push(...[...byKey.values()].sort((a, b) => a.sort_order - b.sort_order));
    }

    // ── Tools: guild-specific overrides 'default' per slug ────────────────
    const tools: ToolMetaRow[] = [];
    if (toolsRes.error) {
      this.logger.error(`tools_meta_data fetch error: ${toolsRes.error.message}`);
    } else {
      const bySlug = new Map<string, ToolMetaRow>();
      for (const row of (toolsRes.data ?? []).filter(r => r.guild_id === 'default')) {
        bySlug.set(row.tool_slug as string, {
          tool_slug: row.tool_slug as string,
          description: (row.description as string) ?? '',
          is_active: (row.is_active as boolean) ?? false,
        });
      }
      for (const row of (toolsRes.data ?? []).filter(r => r.guild_id === guildId)) {
        bySlug.set(row.tool_slug as string, {
          tool_slug: row.tool_slug as string,
          description: (row.description as string) ?? '',
          is_active: (row.is_active as boolean) ?? false,
        });
      }
      tools.push(...bySlug.values());
    }

    // ── Runtime config: guild-specific overrides 'default' per key ────────
    const runtimeConfig = new Map<string, string>();
    if (configRes.error) {
      this.logger.error(`parrot_runtime_config fetch error: ${configRes.error.message}`);
    } else {
      for (const row of (configRes.data ?? []).filter(r => r.guild_id === 'default')) {
        runtimeConfig.set(row.key as string, row.value as string);
      }
      for (const row of (configRes.data ?? []).filter(r => r.guild_id === guildId)) {
        runtimeConfig.set(row.key as string, row.value as string);
      }
    }

    return { tone, sections, tools, runtimeConfig };
  }
}
