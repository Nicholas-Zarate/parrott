import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from './infra/supabase/supabase.module.js';
import { BotCoreModule } from './infra/bot-core.module.js';
import { DiscordModule } from './platforms/discord/discord.module.js';

@Module({
  imports: [
    // Load .env and make ConfigService available globally
    ConfigModule.forRoot({ isGlobal: true }),

    // @nestjs/schedule — cron jobs in Task 6
    ScheduleModule.forRoot(),

    // Supabase client — @Global, injected by SUPABASE_CLIENT token
    SupabaseModule,

    // Shared services — @Global: PersonalityService, FeatureFlagService,
    // ParrottAgentProvider, AllowlistService, RateLimitService
    BotCoreModule,

    // Discord gateway via Necord
    DiscordModule,
  ],
})
export class AppModule {}
