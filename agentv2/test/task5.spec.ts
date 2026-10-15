import { describe, expect, it } from 'vitest';
import { WAKE_REGEX } from '../src/platforms/discord/voice/voice-session.js';

describe('WAKE_REGEX', () => {
  it.each([
    'parrot',
    'Parrott',
    'parot',
    'perrot',
    'Hey, Perra. Hop on',
    'parra',
    'perro',
    'Perry',
    'Barry, shut up',
  ])('wakes on "%s"', (text) => {
    expect(WAKE_REGEX.test(text)).toBe(true);
  });

  it.each(['hello there', 'pear', 'barrier', 'paragraph', 'carrot', 'parrots'])(
    'ignores "%s"',
    (text) => {
      expect(WAKE_REGEX.test(text)).toBe(false);
    },
  );
});
