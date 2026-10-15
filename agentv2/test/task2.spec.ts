import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatPersonalityMarkdown,
  type ToneRow,
  type PromptSectionRow,
  type ToolMetaRow,
} from '../src/core/personality/personality-format.js';
import { buildMemoryScope } from '../src/core/memory/memory-scope.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_TONE: ToneRow = {
  roleName: 'default',
  voice: 'You are Parrott in voice — say things out loud.',
  text: 'You are Parrott in text — chaotic and loyal.',
  vc: 'You are Parrott in VC — keep it punchy.',
};

const SECTIONS: PromptSectionRow[] = [
  {
    key: 'tools',
    content: '## Tools available to you\n\n- **search_web**: search the internet\n- **run_roast**: roast a crew member',
    enabled: true,
    sort_order: 10,
  },
  {
    key: 'rules',
    content: '## Rules\n\n- Don\'t be cruel',
    enabled: true,
    sort_order: 20,
  },
  {
    key: 'disabled_section',
    content: '## Hidden\n\nThis should not appear.',
    enabled: false,
    sort_order: 5,
  },
];

const TOOLS: ToolMetaRow[] = [
  { tool_slug: 'search_web', description: 'Search the web', is_active: true },
  { tool_slug: 'sing_song', description: 'Sing a song', is_active: false },
];

// ── formatPersonalityMarkdown ─────────────────────────────────────────────────

describe('formatPersonalityMarkdown (Task 2)', () => {
  it('opens with context-specific tone text (no header)', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [],
      tools: [],
      context: 'text',
    });
    expect(result).toContain('You are Parrott in text');
    // The tone opener should NOT itself be a ## header
    expect(result.startsWith('##')).toBe(false);
  });

  it('uses voice text for voice context', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [],
      tools: [],
      context: 'voice',
    });
    expect(result).toContain('You are Parrott in voice');
    expect(result).not.toContain('You are Parrott in text');
  });

  it('uses vc text for vc context', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [],
      tools: [],
      context: 'vc',
    });
    expect(result).toContain('You are Parrott in VC');
  });

  it('appends spoken-reply guidance only for voice contexts', () => {
    const base = { tone: DEFAULT_TONE, sections: [], tools: [] };
    expect(formatPersonalityMarkdown({ ...base, context: 'voice' })).toContain('## Spoken replies');
    expect(formatPersonalityMarkdown({ ...base, context: 'vc' })).toContain('## Spoken replies');
    expect(formatPersonalityMarkdown({ ...base, context: 'text' })).not.toContain('## Spoken replies');
  });

  it('falls back to text tone when vc is empty', () => {
    const toneNoVc: ToneRow = { ...DEFAULT_TONE, vc: '' };
    const result = formatPersonalityMarkdown({
      tone: toneNoVc,
      sections: [],
      tools: [],
      context: 'vc',
    });
    expect(result).toContain('You are Parrott in voice');
  });

  it('includes enabled sections, sorted by sort_order', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: SECTIONS,
      tools: [],
    });
    expect(result).toContain('## Tools available to you');
    expect(result).toContain('## Rules');
    // Tools should appear before Rules (sort_order 10 < 20)
    expect(result.indexOf('## Tools')).toBeLessThan(result.indexOf('## Rules'));
  });

  it('excludes disabled sections', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: SECTIONS,
      tools: [],
    });
    expect(result).not.toContain('## Hidden');
    expect(result).not.toContain('This should not appear');
  });

  it('appends fallback tool list when no tools section in sections', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [], // no tools section
      tools: TOOLS,
    });
    // Only active tools should appear
    expect(result).toContain('search_web');
    expect(result).not.toContain('sing_song');
  });

  it('does NOT append fallback tool list when tools section is present', () => {
    // SECTIONS has a 'tools' key — fallback should be skipped
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: SECTIONS,
      tools: TOOLS, // active tools present but sections has 'tools' key
    });
    // The section content should be there, not a duplicated fallback list
    const toolHeaderCount = (result.match(/## Tools/g) ?? []).length;
    expect(toolHeaderCount).toBe(1);
  });

  it('always appends working-memory guidance', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [],
      tools: [],
    });
    expect(result).toContain('## Memory');
    expect(result).toContain('working memory');
  });

  it('defaults context to text when omitted', () => {
    const result = formatPersonalityMarkdown({
      tone: DEFAULT_TONE,
      sections: [],
      tools: [],
    });
    expect(result).toContain('You are Parrott in text');
  });
});

// ── buildMemoryScope ─────────────────────────────────────────────────────────

describe('buildMemoryScope (Task 2)', () => {
  it('scopes threadId to discord: + channelId', () => {
    const { threadId } = buildMemoryScope('chan-001', 'user-abc');
    expect(threadId).toBe('discord:chan-001');
  });

  it('scopes resourceId to discord: + userId', () => {
    const { resourceId } = buildMemoryScope('chan-001', 'user-abc');
    expect(resourceId).toBe('discord:user-abc');
  });

  it('different users get different resourceIds for the same channel', () => {
    const a = buildMemoryScope('chan-001', 'user-a');
    const b = buildMemoryScope('chan-001', 'user-b');
    expect(a.threadId).toBe(b.threadId);    // same channel → same thread
    expect(a.resourceId).not.toBe(b.resourceId); // different users → different resource
  });
});

// ── FeatureFlagService (unit — mocked Supabase) ──────────────────────────────

describe('FeatureFlagService.isLive (Task 2)', async () => {
  // Dynamically import so we can mock Supabase
  const { FeatureFlagService } = await import('../src/infra/feature-flags.service.js');

  function makeSupabaseMock(rows: Array<{ key: string; enabled: boolean; status: string }>) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: rows.map(r => ({ ...r, guild_id: 'default' })), error: null }),
    };
    return {
      from: vi.fn().mockReturnValue(chain),
    } as any;
  }

  it('returns true when enabled=true AND status=live', async () => {
    const svc = new (FeatureFlagService as any)(
      makeSupabaseMock([{ key: 'capability.memory', enabled: true, status: 'live' }]),
    );
    await svc.onModuleInit();
    expect(svc.isLive('capability.memory')).toBe(true);
  });

  it('returns false when enabled=false even if status=live', async () => {
    const svc = new (FeatureFlagService as any)(
      makeSupabaseMock([{ key: 'capability.memory', enabled: false, status: 'live' }]),
    );
    await svc.onModuleInit();
    expect(svc.isLive('capability.memory')).toBe(false);
  });

  it('returns false when status≠live even if enabled=true', async () => {
    const svc = new (FeatureFlagService as any)(
      makeSupabaseMock([{ key: 'capability.memory', enabled: true, status: 'planned' }]),
    );
    await svc.onModuleInit();
    expect(svc.isLive('capability.memory')).toBe(false);
  });

  it('returns false for unknown keys', async () => {
    const svc = new (FeatureFlagService as any)(makeSupabaseMock([]));
    await svc.onModuleInit();
    expect(svc.isLive('unknown.key')).toBe(false);
  });

  it('invalidate() resets the cache so stale values are not returned', async () => {
    const svc = new (FeatureFlagService as any)(
      makeSupabaseMock([{ key: 'capability.memory', enabled: true, status: 'live' }]),
    );
    await svc.onModuleInit();
    expect(svc.isLive('capability.memory')).toBe(true);
    svc.invalidate();
    expect(svc.cacheByGuild.size).toBe(0);
  });
});

// ── createParrottAgent (smoke) ───────────────────────────────────────────────

describe('createParrottAgent (Task 2)', async () => {
  // Mock getParrottMemory so the smoke test doesn't need DATABASE_URL
  vi.mock('../src/core/memory/index.js', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/core/memory/index.js')>();
    return {
      ...real,
      getParrottMemory: () => undefined as any,
    };
  });

  const { createParrottAgent } = await import('../src/core/agents/parrott.js');
  const { ModelRouterLanguageModel } = await import('@mastra/core/llm');

  it('creates a Mastra Agent without throwing', () => {
    const agent = createParrottAgent({
      instructions: () => 'test prompt',
      model: () => new ModelRouterLanguageModel('openai/gpt-4o-mini'),
    });
    expect(agent).toBeTruthy();
    expect(agent.name).toBe('Parrott');
  });
});
