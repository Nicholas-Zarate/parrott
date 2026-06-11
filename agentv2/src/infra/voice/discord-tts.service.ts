/**
 * DiscordTtsService — TTS router.
 *
 * Selects the active TtsPort implementation based on the
 * capability.tts.elevenlabs feature flag (per-guild, 45s TTL cache).
 *
 * Flag OFF (default) → OpenAiTtsService  (batch mp3, works without ElevenLabs key)
 * Flag LIVE          → ElevenLabsTtsService (streaming Flash v2.5)
 *
 * Voice sessions call forGuild(guildId) per-turn so live flag changes
 * take effect within the cache TTL without a restart.
 */

import { Injectable } from '@nestjs/common';
import { FeatureFlagService } from '../feature-flags.service.js';
import { OpenAiTtsService } from './openai-tts.service.js';
import { ElevenLabsTtsService } from './elevenlabs-tts.service.js';
import type { TtsPort } from '../../core/ports/tts.port.js';

@Injectable()
export class DiscordTtsService {
  constructor(
    private readonly openai: OpenAiTtsService,
    private readonly elevenlabs: ElevenLabsTtsService,
    private readonly flags: FeatureFlagService,
  ) {}

  /** Returns the active TtsPort for this guild. Re-evaluates the flag each call. */
  forGuild(guildId: string): TtsPort {
    return this.flags.isLive('capability.tts.elevenlabs', guildId)
      ? this.elevenlabs
      : this.openai;
  }
}
