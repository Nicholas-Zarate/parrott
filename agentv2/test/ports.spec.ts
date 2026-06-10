import { describe, it, expect } from 'vitest';
import type { IncomingMessage, Replier, VoiceSink } from '../src/core/ports/index.js';

/**
 * Task 1 acceptance gate — Vitest harness proof.
 * These tests are deliberately simple: they prove the harness runs and the
 * core port types compile under moduleResolution: nodenext.
 */
describe('Core ports (Task 1 — Vitest harness proof)', () => {
  it('IncomingMessage satisfies its shape', () => {
    const msg: IncomingMessage = {
      text: 'yo Parrott',
      userId: '774794604394053632',
      channelId: '1234567890',
      guildId: '9876543210',
      username: 'swim',
      messageId: 'msg-001',
    };
    expect(msg.text).toBe('yo Parrott');
    expect(msg.userId).toBeTruthy();
  });

  it('Replier and VoiceSink are interface-compatible', () => {
    // Implement the interfaces as stubs — proves they compile correctly
    const replier: Replier = {
      reply: async (text: string) => { void text; },
      placeholder: async (text: string) => async (_final: string) => { void text; },
    };
    const sink: VoiceSink = {
      speak: async (audio: Buffer) => { void audio; },
      isConnected: () => false,
    };

    expect(typeof replier.reply).toBe('function');
    expect(typeof replier.placeholder).toBe('function');
    expect(typeof sink.speak).toBe('function');
    expect(sink.isConnected()).toBe(false);
  });

  it('resourceId and threadId follow the discord: prefix convention', () => {
    const userId = '774794604394053632';
    const channelId = '1234567890';
    const resourceId = `discord:${userId}`;
    const threadId = `discord:${channelId}`;
    expect(resourceId).toBe('discord:774794604394053632');
    expect(threadId).toBe('discord:1234567890');
  });
});
