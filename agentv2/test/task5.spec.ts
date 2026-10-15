import { describe, expect, it } from 'vitest';
import { WAKE_REGEX, stripWakeWord } from '../src/platforms/discord/voice/voice-session.js';
import { eagerIterable, prefetchTts } from '../src/platforms/discord/voice/audio-output.js';
import { createAsyncQueue } from '../src/platforms/discord/voice/async-queue.js';
import type { TtsPort } from '../src/core/ports/tts.port.js';

describe('WAKE_REGEX', () => {
  it.each([
    'hey mr parrot',
    'Hey, Mister Parrot, what time is it',
    'hey mr. parrott',
    'Hey Mr Perra',
    'mister parrot are you there',
    'hey mister harold',
    'Hey, Mr. Barry',
  ])('wakes on "%s"', (text) => {
    expect(WAKE_REGEX.test(text)).toBe(true);
  });

  it.each([
    'parrot',
    'hey parrot',
    'Harol, you coming?',
    'hey harold',
    'Barry, shut up',
    'mr parrots',
    'mister',
    'hello there',
  ])('ignores "%s"', (text) => {
    expect(WAKE_REGEX.test(text)).toBe(false);
  });
});

describe('stripWakeWord', () => {
  it('drops pre-wake chatter and the wake phrase itself', () => {
    expect(stripWakeWord("Hey y'all. Hey, Mister Parrot, are you listening?")).toBe(
      'are you listening?',
    );
  });

  it('strips through the wake phrase only', () => {
    expect(stripWakeWord('hey mr parrot, tell perry a joke')).toBe('tell perry a joke');
  });

  it('returns empty when only the wake phrase was said', () => {
    expect(stripWakeWord('Hey, Mister Parrot.')).toBe('');
    expect(stripWakeWord('hey mr parrot?')).toBe('');
  });

  it('leaves text without a wake phrase untouched', () => {
    expect(stripWakeWord('  what time is it  ')).toBe('what time is it');
  });
});

describe('createAsyncQueue', () => {
  it('yields pushed items in order, then ends on close', async () => {
    const q = createAsyncQueue<number>();
    q.push(1);
    q.push(2);
    setTimeout(() => {
      q.push(3);
      q.close();
    }, 0);
    const out: number[] = [];
    for await (const n of q) out.push(n);
    expect(out).toEqual([1, 2, 3]);
  });

  it('rejects the consumer on fail', async () => {
    const q = createAsyncQueue<number>();
    setTimeout(() => q.fail(new Error('boom')), 0);
    await expect((async () => { for await (const _ of q) { /* drain */ } })()).rejects.toThrow('boom');
  });
});

describe('eagerIterable', () => {
  it('starts consuming before the caller reads', async () => {
    let started = false;
    async function* src() {
      started = true;
      yield 'a';
      yield 'b';
    }
    const eager = eagerIterable(src(), new AbortController().signal);
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toBe(true);
    const out: string[] = [];
    for await (const x of eager) out.push(x);
    expect(out).toEqual(['a', 'b']);
  });
});

describe('prefetchTts', () => {
  function makeTts() {
    const started: string[] = [];
    const release = new Map<string, () => void>();
    const tts: TtsPort = {
      async *synthesize(text) {
        started.push(text);
        await new Promise<void>((r) => release.set(text, r));
        yield Buffer.from(text);
      },
      async close() {},
    };
    return { tts, started, release };
  }

  it('requests the next sentence while the current one is still synthesizing', async () => {
    const { tts, started, release } = makeTts();
    async function* sentences() {
      yield 'one.';
      yield 'two.';
    }
    const out = prefetchTts(sentences(), tts, new AbortController().signal);
    const it = out[Symbol.asyncIterator]();
    const first = await it.next();
    await new Promise((r) => setTimeout(r, 0));

    // Both TTS calls are in flight before any audio has been consumed.
    expect(started).toEqual(['one.', 'two.']);

    release.get('one.')!();
    release.get('two.')!();

    const chunks: string[] = [];
    for await (const c of first.value) chunks.push(c.toString());
    const second = await it.next();
    for await (const c of second.value) chunks.push(c.toString());
    expect(chunks).toEqual(['one.', 'two.']);
    expect((await it.next()).done).toBe(true);
  });

  it('stops scheduling sentences once aborted', async () => {
    const { tts, started, release } = makeTts();
    const ac = new AbortController();
    async function* sentences() {
      yield 'one.';
      ac.abort();
      yield 'two.';
    }
    const out = prefetchTts(sentences(), tts, ac.signal);
    const it = out[Symbol.asyncIterator]();
    await it.next();
    await new Promise((r) => setTimeout(r, 0));
    release.get('one.')?.();
    expect(started).toEqual(['one.']);
    expect((await it.next()).done).toBe(true);
  });
});
