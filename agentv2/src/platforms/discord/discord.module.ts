import { Module } from '@nestjs/common';
import { NecordModule } from 'necord';
import { IntentsBitField, Partials } from 'discord.js';
import { DiscordEventsService } from './discord-events.service.js';
import { MentionService } from './mention.service.js';
import { VoiceModule } from './voice/voice.module.js';

@Module({
  imports: [
    NecordModule.forRoot({
      token: process.env.DISCORD_TOKEN ?? '',
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildPresences,   // required: activity triggers
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,    // privileged: @mention text
        IntentsBitField.Flags.GuildVoiceStates,  // required: voice channel events
      ],
      partials: [Partials.Channel, Partials.Message],
    }),
    VoiceModule,
  ],
  providers: [DiscordEventsService, MentionService],
  exports: [DiscordEventsService],
})
export class DiscordModule {}
