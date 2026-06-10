import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from './infra/supabase/supabase.module.js';
import { DiscordModule } from './platforms/discord/discord.module.js';

@Module({
  imports: [
    // Load .env and make ConfigService available globally
    ConfigModule.forRoot({ isGlobal: true }),

    // @nestjs/schedule — cron jobs (announcements, voice-quick-comment) in Task 6
    ScheduleModule.forRoot(),

    // Supabase client — global, injected by token SUPABASE_CLIENT
    SupabaseModule,

    // Discord gateway via Necord
    DiscordModule,
  ],
})
export class AppModule {}
