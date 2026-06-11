/**
 * BotCoreModule — @Global shared services available to all modules.
 *
 * Uses the same pattern as SupabaseModule so Discord/platform modules can
 * inject these services without a circular import through AppModule.
 *
 * Exports: PersonalityService, FeatureFlagService, ParrottAgentProvider,
 *          AllowlistService, RateLimitService, DiscordTimerService,
 *          DiscordRoastAdapter
 */

import { Global, Module } from '@nestjs/common';
import { PersonalityService } from './personality.service.js';
import { FeatureFlagService } from './feature-flags.service.js';
import { ParrottAgentProvider } from './parrott-agent.provider.js';
import { AllowlistService } from './allowlist.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { DiscordTimerService } from './discord-timer.service.js';
import { DiscordRoastAdapter } from './discord-roast.adapter.js';

@Global()
@Module({
  providers: [
    PersonalityService,
    FeatureFlagService,
    DiscordTimerService,
    DiscordRoastAdapter,
    ParrottAgentProvider,
    AllowlistService,
    RateLimitService,
  ],
  exports: [
    PersonalityService,
    FeatureFlagService,
    DiscordTimerService,
    DiscordRoastAdapter,
    ParrottAgentProvider,
    AllowlistService,
    RateLimitService,
  ],
})
export class BotCoreModule {}
