/**
 * Task 4: Core tools unit tests.
 *
 * Tests are pure — no DB, no Discord, no network (fetch is mocked with vi.stubGlobal).
 * Port interfaces are stubbed inline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSearchWebTool } from '../src/core/tools/search-web.js';
import { createSingSongTool } from '../src/core/tools/sing-song.js';
import { createTimerTool, type TimerPort, type TimerOpts } from '../src/core/tools/create-timer.js';
import { createRunRoastTool, type RoastDataPort } from '../src/core/tools/run-roast.js';
import { buildTools } from '../src/core/tools/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response),
  );
}

function getTool(description = 'test') {
  return createSearchWebTool(description);
}

// Grab the raw execute fn — Mastra wraps it in a class so we call tool.execute()
async function exec(tool: ReturnType<typeof createSearchWebTool>, input: Record<string, unknown>) {
  return tool.execute(input as Parameters<typeof tool.execute>[0]);
}

// ── search_web ────────────────────────────────────────────────────────────────

describe('search_web', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['TAVILY_API_KEY'];
  });

  it('returns error when TAVILY_API_KEY is missing', async () => {
    const result = await exec(getTool(), { query: 'hello' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not configured') });
  });

  it('returns results on success', async () => {
    process.env['TAVILY_API_KEY'] = 'test-key';
    mockFetch(200, {
      results: [
        { title: 'Foo', url: 'https://example.com', content: 'bar baz' },
      ],
    });
    const result = await exec(getTool(), { query: 'test query' }) as { success: boolean; results: unknown[] };
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
  });

  it('caps results at 5', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    const many = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`, url: `https://x${i}.com`, content: 'x'.repeat(50),
    }));
    mockFetch(200, { results: many });
    const result = await exec(getTool(), { query: 'lots' }) as { success: boolean; results: unknown[] };
    expect(result.results).toHaveLength(5);
  });

  it('truncates snippets over 400 chars and appends ellipsis', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    const longContent = 'x'.repeat(500);
    mockFetch(200, { results: [{ title: 'T', url: 'u', content: longContent }] });
    const result = await exec(getTool(), { query: 'x' }) as { success: boolean; results: Array<{ content: string }> };
    expect(result.results[0]!.content.endsWith('…')).toBe(true);
    expect(result.results[0]!.content.length).toBeLessThanOrEqual(401); // 400 chars + ellipsis
  });

  it('returns 401 error', async () => {
    process.env['TAVILY_API_KEY'] = 'bad-key';
    mockFetch(401, { error: 'Unauthorized' });
    const result = await exec(getTool(), { query: 'q' });
    expect(result).toMatchObject({ success: false, error: 'Invalid Tavily API key.' });
  });

  it('returns 429 error', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    mockFetch(429, { error: 'rate limit' });
    const result = await exec(getTool(), { query: 'q' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('rate limit') });
  });

  it('handles fetch network error', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const result = await exec(getTool(), { query: 'q' });
    expect(result).toMatchObject({ success: false, error: 'Network failure' });
  });
});

// ── sing_song ─────────────────────────────────────────────────────────────────

describe('sing_song', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['TAVILY_API_KEY'];
  });

  it('returns error when TAVILY_API_KEY is missing', async () => {
    const tool = createSingSongTool('desc');
    const result = await tool.execute({ songQuery: 'hello' } as Parameters<typeof tool.execute>[0]);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not configured') });
  });

  it('returns lyrics on success', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    mockFetch(200, {
      results: [{ content: 'La la la, this is a chorus that has more than 40 chars easily' }],
    });
    const tool = createSingSongTool('desc');
    const result = await tool.execute({ songQuery: 'La La Land' } as Parameters<typeof tool.execute>[0]) as { success: boolean; lyrics: string; note: string };
    expect(result.success).toBe(true);
    expect(result.lyrics.length).toBeGreaterThan(0);
    expect(result.note).toContain('Task 5');
  });

  it('returns error when no lyrics found', async () => {
    process.env['TAVILY_API_KEY'] = 'key';
    mockFetch(200, { results: [{ content: 'short' }] });
    const tool = createSingSongTool('desc');
    const result = await tool.execute({ songQuery: 'mystery song' } as Parameters<typeof tool.execute>[0]);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("Couldn't find") });
  });
});

// ── create_timer ──────────────────────────────────────────────────────────────

describe('create_timer', () => {
  const scheduled: TimerOpts[] = [];
  const port: TimerPort = { schedule: (opts) => { scheduled.push(opts); } };

  beforeEach(() => { scheduled.length = 0; });

  function run(input: Record<string, unknown>) {
    const tool = createTimerTool('desc', port);
    return tool.execute(input as Parameters<typeof tool.execute>[0]);
  }

  it('schedules a basic timer and returns success', async () => {
    const result = await run({
      channelId: 'c1', userId: 'u1', guildId: 'g1',
      durationMinutes: 5, isPopeyesTimer: false,
      reminderMessage: 'check laundry', replyInChannel: true,
    }) as { success: boolean; durationMinutes: number; message: string };
    expect(result.success).toBe(true);
    expect(result.durationMinutes).toBe(5);
    expect(result.message).toContain('5 minutes');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.durationMs).toBe(5 * 60 * 1000);
  });

  it('Popeyes timer generates 12–25 minute range', async () => {
    // Run 20 times; all should land in [12, 25]
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await run({
        channelId: 'c1', userId: `u_popeyes_${i}`, guildId: 'g1',
        durationMinutes: 0, isPopeyesTimer: true,
        reminderMessage: '', replyInChannel: true,
      }) as { success: boolean; durationMinutes: number };
      expect(r.success).toBe(true);
      results.push(r.durationMinutes);
    }
    for (const min of results) {
      expect(min).toBeGreaterThanOrEqual(12);
      expect(min).toBeLessThanOrEqual(25);
    }
  });

  it('returns error when durationMinutes=0 and not Popeyes', async () => {
    const result = await run({
      channelId: 'c1', userId: 'u_nodur', guildId: 'g1',
      durationMinutes: 0, isPopeyesTimer: false,
      reminderMessage: '', replyInChannel: true,
    });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('How many minutes') });
  });

  it('rate-limits after 3 timers in 10 minutes for same user', async () => {
    const userId = 'u_ratelimit_timer';
    const base = {
      channelId: 'c1', userId, guildId: 'g1',
      durationMinutes: 2, isPopeyesTimer: false,
      reminderMessage: '', replyInChannel: true,
    };
    for (let i = 0; i < 3; i++) {
      const r = await run(base) as { success: boolean };
      expect(r.success).toBe(true);
    }
    const blocked = await run(base);
    expect(blocked).toMatchObject({ success: false, error: expect.stringContaining('Too many timers') });
  });

  it('reminder message is trimmed and capped at 200 chars', async () => {
    const longMsg = 'x'.repeat(300);
    await run({
      channelId: 'c1', userId: 'u_longmsg', guildId: 'g1',
      durationMinutes: 1, isPopeyesTimer: false,
      reminderMessage: longMsg, replyInChannel: false,
    });
    expect(scheduled.at(-1)!.reminderMessage.length).toBeLessThanOrEqual(200);
  });

  it('clamps duration to 1 min minimum', async () => {
    const r = await run({
      channelId: 'c1', userId: 'u_clamp', guildId: 'g1',
      durationMinutes: 0.1, isPopeyesTimer: false,
      reminderMessage: '', replyInChannel: true,
    }) as { success: boolean; durationMinutes: number };
    expect(r.success).toBe(true);
    expect(r.durationMinutes).toBe(1);
  });

  it('includes reminder text in response message', async () => {
    const r = await run({
      channelId: 'c1', userId: 'u_remind', guildId: 'g1',
      durationMinutes: 3, isPopeyesTimer: false,
      reminderMessage: 'pizza', replyInChannel: true,
    }) as { success: boolean; message: string };
    expect(r.message).toContain('pizza');
  });
});

// ── run_roast ─────────────────────────────────────────────────────────────────

describe('run_roast', () => {
  const port: RoastDataPort = {
    getDisplayName: vi.fn().mockResolvedValue('Harol'),
  };

  function run(input: Record<string, unknown>) {
    const tool = createRunRoastTool('desc', port);
    return tool.execute(input as Parameters<typeof tool.execute>[0]);
  }

  it('returns error when neither id nor name provided', async () => {
    const r = await run({ guildId: 'g1' });
    expect(r).toMatchObject({ success: false });
  });

  it('name-only path succeeds without calling port', async () => {
    vi.mocked(port.getDisplayName).mockClear();
    const r = await run({ targetUserName: 'Marcos', guildId: 'g1' }) as { success: boolean; targetName: string; context: string };
    expect(r.success).toBe(true);
    expect(r.targetName).toBe('Marcos');
    expect(r.context).toBe('name_only');
    expect(port.getDisplayName).not.toHaveBeenCalled();
  });

  it('user ID path calls port and returns display name', async () => {
    vi.mocked(port.getDisplayName).mockResolvedValueOnce('HarolG');
    const r = await run({ targetUserId: '111', guildId: 'g1' }) as { success: boolean; targetName: string; context: string };
    expect(r.success).toBe(true);
    expect(r.targetName).toBe('HarolG');
    expect(r.context).toBe('user_id');
  });

  it('falls back to @mention when port returns null', async () => {
    vi.mocked(port.getDisplayName).mockResolvedValueOnce(null);
    const r = await run({ targetUserId: '222', guildId: 'g1' }) as { success: boolean; targetName: string };
    expect(r.success).toBe(true);
    expect(r.targetName).toBe('<@222>');
  });

  it('falls back to targetUserName when port returns null and name provided', async () => {
    vi.mocked(port.getDisplayName).mockResolvedValueOnce(null);
    const r = await run({ targetUserId: '333', targetUserName: 'Tom', guildId: 'g1' }) as { success: boolean; targetName: string };
    expect(r.success).toBe(true);
    expect(r.targetName).toBe('Tom');
  });

  it('skips port when guildId is missing', async () => {
    vi.mocked(port.getDisplayName).mockClear();
    const r = await run({ targetUserId: '444' }) as { success: boolean; targetName: string };
    expect(r.success).toBe(true);
    expect(port.getDisplayName).not.toHaveBeenCalled();
    expect(r.targetName).toBe('<@444>');
  });
});

// ── buildTools ────────────────────────────────────────────────────────────────

describe('buildTools', () => {
  const port: TimerPort = { schedule: vi.fn() };
  const roastPort: RoastDataPort = { getDisplayName: vi.fn().mockResolvedValue(null) };

  it('returns all 5 tool keys', () => {
    const tools = buildTools(new Map(), { timer: port, roastData: roastPort });
    expect(Object.keys(tools).sort()).toEqual([
      'create_timer', 'make_joke_like', 'run_roast', 'search_web', 'sing_song',
    ]);
  });

  it('uses description from map when available', () => {
    const map = new Map([['search_web', 'Custom search desc']]);
    const tools = buildTools(map, { timer: port, roastData: roastPort });
    expect((tools['search_web'] as { description: string }).description).toBe('Custom search desc');
  });

  it('falls back to default description when slug absent', () => {
    const tools = buildTools(new Map(), { timer: port, roastData: roastPort });
    const desc = (tools['search_web'] as { description: string }).description;
    expect(desc.length).toBeGreaterThan(0);
  });
});
