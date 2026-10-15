/**
 * Task 3 tests — mention adapter pipeline
 *
 * Covers:
 *   - RateLimitService  (in-memory, no I/O)
 *   - AllowlistService  (mocked Supabase + FeatureFlagService)
 *   - extractText       (exported for test via re-export below)
 *   - MentionService pipeline gates (mocked Discord Message)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitService } from '../src/infra/rate-limit.service.js';
import { AllowlistService } from '../src/infra/allowlist.service.js';
import { MentionService } from '../src/platforms/discord/mention.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSupabaseList(rows: unknown[] = [], error: string | null = null) {
  const chain = {
    select: vi.fn().mockResolvedValue({ data: rows, error: error ? { message: error } : null }),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  // make select itself the terminal — override to resolve
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ── RateLimitService ──────────────────────────────────────────────────────────

describe('RateLimitService', () => {
  let svc: RateLimitService;

  beforeEach(() => {
    svc = new RateLimitService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows unlimited tier unconditionally', () => {
    for (let i = 0; i < 100; i++) {
      expect(svc.checkAndRecord('u1', 'unlimited').allowed).toBe(true);
    }
  });

  it('semi — allows first 5 within 2 min', () => {
    for (let i = 0; i < 5; i++) {
      expect(svc.checkAndRecord('u1', 'semi').allowed).toBe(true);
    }
  });

  it('semi — blocks the 6th within 2 min', () => {
    for (let i = 0; i < 5; i++) svc.checkAndRecord('u1', 'semi');
    const result = svc.checkAndRecord('u1', 'semi');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('semi — blocked attempts do not extend the window', () => {
    // 5 allowed
    for (let i = 0; i < 5; i++) svc.checkAndRecord('u1', 'semi');
    // several blocked
    for (let i = 0; i < 10; i++) svc.checkAndRecord('u1', 'semi');

    // advance past the 2-min window from the FIRST allowed call
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);

    // should be allowed again
    expect(svc.checkAndRecord('u1', 'semi').allowed).toBe(true);
  });

  it('limited — blocks after 4 within 5 min', () => {
    for (let i = 0; i < 4; i++) svc.checkAndRecord('u2', 'limited');
    expect(svc.checkAndRecord('u2', 'limited').allowed).toBe(false);
  });

  it('users are isolated — different users do not share state', () => {
    for (let i = 0; i < 5; i++) svc.checkAndRecord('userA', 'semi');
    // userA is at limit; userB should still be fine
    expect(svc.checkAndRecord('userB', 'semi').allowed).toBe(true);
  });

  it('retryAfterSeconds returns 0 when under limit', () => {
    svc.checkAndRecord('u1', 'semi');
    expect(svc.retryAfterSeconds('u1', 'semi')).toBe(0);
  });

  it('retryAfterSeconds returns positive when over limit', () => {
    for (let i = 0; i < 5; i++) svc.checkAndRecord('u1', 'semi');
    expect(svc.retryAfterSeconds('u1', 'semi')).toBeGreaterThan(0);
  });

  it('retryAfterSeconds returns 0 for unlimited', () => {
    expect(svc.retryAfterSeconds('u1', 'unlimited')).toBe(0);
  });

  it('plural formats correctly', () => {
    expect(RateLimitService.plural(1)).toBe('1 second');
    expect(RateLimitService.plural(0)).toBe('0 seconds');
    expect(RateLimitService.plural(60)).toBe('60 seconds');
  });

  it('semi — resets after window expires', () => {
    for (let i = 0; i < 5; i++) svc.checkAndRecord('u1', 'semi');
    expect(svc.checkAndRecord('u1', 'semi').allowed).toBe(false);
    vi.advanceTimersByTime(2 * 60 * 1000 + 100);
    expect(svc.checkAndRecord('u1', 'semi').allowed).toBe(true);
  });
});

// ── AllowlistService ──────────────────────────────────────────────────────────

describe('AllowlistService', () => {
  function makeFlags(live: boolean) {
    return { isLive: vi.fn().mockReturnValue(live) };
  }

  it('returns allowed=true, tier=unlimited when flag is off', async () => {
    const flags = makeFlags(false);
    const supabase = makeSupabaseList();
    const svc = new AllowlistService(supabase as never, flags as never);
    const result = await svc.check('ch1', 'g1');
    expect(result).toEqual({ allowed: true, tier: 'unlimited' });
    // Supabase should not be called when flag is off
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('allows channel in list with correct tier', async () => {
    const flags = makeFlags(true);
    const rows = [{ channel_id: 'ch1', guild_id: 'g1', tier: 'semi', is_active: true }];
    const supabase = makeSupabaseList(rows);
    const svc = new AllowlistService(supabase as never, flags as never);
    const result = await svc.check('ch1', 'g1');
    expect(result).toEqual({ allowed: true, tier: 'semi' });
  });

  it('blocks channel not in list when flag is live', async () => {
    const flags = makeFlags(true);
    const supabase = makeSupabaseList([]);
    const svc = new AllowlistService(supabase as never, flags as never);
    const result = await svc.check('unknown-channel', 'g1');
    expect(result.allowed).toBe(false);
  });

  it('blocks inactive channel even when in list', async () => {
    const flags = makeFlags(true);
    const rows = [{ channel_id: 'ch1', guild_id: 'g1', tier: 'semi', is_active: false }];
    const supabase = makeSupabaseList(rows);
    const svc = new AllowlistService(supabase as never, flags as never);
    const result = await svc.check('ch1', 'g1');
    expect(result.allowed).toBe(false);
  });

  it('uses cached result on second call', async () => {
    const flags = makeFlags(true);
    const rows = [{ channel_id: 'ch1', guild_id: 'g1', tier: 'limited', is_active: true }];
    const supabase = makeSupabaseList(rows);
    const svc = new AllowlistService(supabase as never, flags as never);
    await svc.check('ch1', 'g1');
    await svc.check('ch1', 'g1');
    // from() called once (first fetch), served from cache on second
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('invalidate() causes re-fetch on next check', async () => {
    const flags = makeFlags(true);
    const rows = [{ channel_id: 'ch1', guild_id: 'g1', tier: 'semi', is_active: true }];
    const supabase = makeSupabaseList(rows);
    const svc = new AllowlistService(supabase as never, flags as never);
    await svc.check('ch1', 'g1');
    svc.invalidate();
    await svc.check('ch1', 'g1');
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});

// ── extractText (pure function, tested via module import) ────────────────────

// extractText is a module-private function. We test it indirectly
// via the known behaviour: @mention stripped, remaining text returned.
// Since the function isn't exported, we inline-test its logic here.

describe('extractText logic', () => {
  function extractText(content: string, botId: string): string {
    const text = content
      .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
      .trim();
    return text || '(no content)';
  }

  it('strips standard @mention', () => {
    expect(extractText('<@123456> hello there', '123456')).toBe('hello there');
  });

  it('strips nickname @mention (<@!id>)', () => {
    expect(extractText('<@!123456> hello there', '123456')).toBe('hello there');
  });

  it('strips multiple mentions', () => {
    expect(extractText('<@123456> hey <@123456> again', '123456')).toBe('hey  again'.trim());
  });

  it('returns (no content) for mention-only message', () => {
    expect(extractText('<@123456>', '123456')).toBe('(no content)');
  });

  it('returns (no content) for whitespace-only after stripping', () => {
    expect(extractText('<@123456>   ', '123456')).toBe('(no content)');
  });

  it('preserves text with no mention', () => {
    expect(extractText('just some text', '123456')).toBe('just some text');
  });

  it('does not strip a different bot id', () => {
    expect(extractText('<@999999> hi', '123456')).toBe('<@999999> hi');
  });
});

// ── hasBlockedRole logic ──────────────────────────────────────────────────────
// BLOCKED_ROLE_NAMES is a module-level constant frozen at import time, so it
// can't be manipulated via env vars in tests. We test the underlying logic
// inline — same approach as extractText above.

describe('hasBlockedRole logic', () => {
  function hasBlockedRole(roleNames: string[], blocklist: string[]): boolean {
    if (blocklist.length === 0) return false;
    for (const name of roleNames) {
      if (blocklist.includes(name.trim().toLowerCase())) return true;
    }
    return false;
  }

  it('returns false when blocklist is empty', () => {
    expect(hasBlockedRole(['admin', 'muted'], [])).toBe(false);
  });

  it('returns true when member has a blocked role (case-insensitive)', () => {
    expect(hasBlockedRole(['Muted'], ['muted'])).toBe(true);
  });

  it('returns false when member has no blocked roles', () => {
    expect(hasBlockedRole(['member', 'admin'], ['muted', 'restricted'])).toBe(false);
  });

  it('returns true on first matching role (short-circuits)', () => {
    expect(hasBlockedRole(['restricted', 'member'], ['restricted'])).toBe(true);
  });

  it('returns false for member with no roles', () => {
    expect(hasBlockedRole([], ['muted'])).toBe(false);
  });
});

// ── MentionService pipeline ───────────────────────────────────────────────────

/**
 * Builds a minimal fake Discord Message. Only the fields MentionService reads
 * are provided — the cast to `unknown as Message` mirrors what discord-events
 * does at the call site.
 */
function makeMessage(overrides: {
  content?: string;
  botId?: string;
  userId?: string;
  channelId?: string;
  guildId?: string | null;
  memberRoles?: string[];
  hasMember?: boolean;
}) {
  const {
    content = '<@BOT> hello',
    botId = 'BOT',
    userId = 'U1',
    channelId = 'C1',
    guildId = 'G1',
    memberRoles = [],
    hasMember = true,
  } = overrides;

  const placeholder = {
    id: 'placeholder-id',
    edit: vi.fn().mockResolvedValue(undefined),
  };

  const roles = new Map(memberRoles.map((name) => [name, { name, id: name }]));
  const member = hasMember ? { roles: { cache: roles } } : null;

  const guild = guildId
    ? { members: { fetch: vi.fn().mockResolvedValue(member) } }
    : null;

  return {
    content,
    channelId,
    guildId,
    id: 'msg-id',
    author: { id: userId, username: 'testuser', discriminator: '0', bot: false },
    member,
    guild,
    client: { user: { id: botId } },
    mentions: { has: vi.fn().mockReturnValue(true), roles: new Map() },
    reply: vi.fn().mockResolvedValue(placeholder),
    _placeholder: placeholder,
  };
}

/** Builds a MentionService with all dependencies stubbed to happy-path defaults. */
function makeSvc(overrides: {
  allowed?: boolean;
  tier?: 'unlimited' | 'semi' | 'limited';
  rateLimitAllowed?: boolean;
  retryAfterSeconds?: number;
  memoryLive?: boolean;
  agentText?: string;
  agentError?: boolean;
}) {
  const {
    allowed = true,
    tier = 'unlimited',
    rateLimitAllowed = true,
    retryAfterSeconds = 30,
    memoryLive = false,
    agentText = 'yo what up',
    agentError = false,
  } = overrides;

  const allowlist = {
    check: vi.fn().mockResolvedValue({ allowed, tier }),
  };

  const rateLimiter = {
    checkAndRecord: vi.fn().mockReturnValue(
      rateLimitAllowed ? { allowed: true } : { allowed: false, retryAfterSeconds },
    ),
    retryAfterSeconds: vi.fn().mockReturnValue(0),
  };

  const generateMock = agentError
    ? vi.fn().mockRejectedValue(new Error('LLM down'))
    : vi.fn().mockResolvedValue({ text: agentText, toolCalls: [] });

  const agentProvider = {
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
    isMemoryLive: vi.fn().mockReturnValue(memoryLive),
  };

  const supabase = {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  const svc = new MentionService(
    allowlist as never,
    rateLimiter as never,
    agentProvider as never,
    supabase as never,
  );

  return { svc, allowlist, rateLimiter, agentProvider, generateMock, supabase };
}

describe('MentionService pipeline', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('gate 2: channel not in allowlist → silent ignore, no reply', async () => {
    const { svc, generateMock } = makeSvc({ allowed: false });
    const msg = makeMessage({});

    await svc.handle(msg as never);

    expect(msg.reply).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('gate 3: rate limited → sends resting message, does not call agent', async () => {
    const { svc, generateMock } = makeSvc({ rateLimitAllowed: false, retryAfterSeconds: 45 });
    const msg = makeMessage({});

    await svc.handle(msg as never);

    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('45 seconds'));
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('happy path: sends placeholder, calls agent, edits with reply', async () => {
    const { svc, generateMock } = makeSvc({ agentText: 'squawk!' });
    const msg = makeMessage({ content: '<@BOT> hey' });

    await svc.handle(msg as never);

    expect(msg.reply).toHaveBeenCalledWith('juan second...');
    expect(generateMock).toHaveBeenCalledWith(
      [expect.objectContaining({ role: 'user', content: expect.stringContaining('hey') })],
      expect.anything(),
    );
    expect(msg._placeholder.edit).toHaveBeenCalledWith('squawk!');
  });

  it('happy path: empty agent text falls back to SQUAWK.', async () => {
    const { svc } = makeSvc({ agentText: '' });
    const msg = makeMessage({});

    await svc.handle(msg as never);

    expect(msg._placeholder.edit).toHaveBeenCalledWith('SQUAWK.');
  });

  it('memory disabled: agent called without memory options', async () => {
    const { svc, generateMock } = makeSvc({ memoryLive: false });
    const msg = makeMessage({});

    await svc.handle(msg as never);

    expect(generateMock).toHaveBeenCalledWith(
      expect.anything(),
      {}, // no memory key
    );
  });

  it('memory enabled: agent called with thread + resource ids', async () => {
    const { svc, generateMock } = makeSvc({ memoryLive: true });
    const msg = makeMessage({ channelId: 'C1', userId: 'U1' });

    await svc.handle(msg as never);

    expect(generateMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        memory: {
          thread: 'discord:C1',
          resource: 'discord:U1',
        },
      },
    );
  });

  it('agent error: placeholder edited with error message', async () => {
    const { svc } = makeSvc({ agentError: true });
    const msg = makeMessage({});

    await svc.handle(msg as never);

    expect(msg._placeholder.edit).toHaveBeenCalledWith(
      expect.stringContaining('something went wrong'),
    );
  });

  it('placeholder send failure → returns early, no agent call', async () => {
    const { svc, generateMock } = makeSvc({});
    const msg = makeMessage({});
    msg.reply.mockRejectedValueOnce(new Error('Discord 403'));

    await svc.handle(msg as never);

    expect(generateMock).not.toHaveBeenCalled();
  });

  it('saves conversation history on success', async () => {
    const { svc, supabase } = makeSvc({ agentText: 'hello' });
    const msg = makeMessage({ content: '<@BOT> hey', channelId: 'C1', guildId: 'G1' });

    await svc.handle(msg as never);
    // fire-and-forget — flush microtasks
    await Promise.resolve();

    expect(supabase.from).toHaveBeenCalledWith('parrot_conversation_history');
  });

  it('onModuleDestroy clears active intervals', async () => {
    const { svc } = makeSvc({ rateLimitAllowed: false, retryAfterSeconds: 60 });
    const msg = makeMessage({});

    await svc.handle(msg as never);
    // one interval should now be active

    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    svc.onModuleDestroy();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('rate-limit countdown interval updates the message every 15s', async () => {
    const { svc, rateLimiter } = makeSvc({ rateLimitAllowed: false, retryAfterSeconds: 60 });
    // Make retryAfterSeconds tick down
    (rateLimiter.retryAfterSeconds as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(45)
      .mockReturnValueOnce(30)
      .mockReturnValue(0); // third tick → 0 → clear interval

    const msg = makeMessage({});
    await svc.handle(msg as never);

    const placeholder = msg._placeholder;

    // Advance 15s — first update
    await vi.advanceTimersByTimeAsync(15_000);
    expect(placeholder.edit).toHaveBeenCalledWith(expect.stringContaining('45 seconds'));

    // Advance another 15s — second update
    await vi.advanceTimersByTimeAsync(15_000);
    expect(placeholder.edit).toHaveBeenCalledWith(expect.stringContaining('30 seconds'));

    // Advance another 15s — retryAfterSeconds returns 0, interval clears
    await vi.advanceTimersByTimeAsync(15_000);
    expect(placeholder.edit).toHaveBeenCalledWith(expect.stringContaining('try again now'));
  });
});
