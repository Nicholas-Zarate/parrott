/**
 * VoiceInfraModule — NestJS module for STT/TTS/VAD infra services.
 *
 * @Global so VoiceModule (platforms/discord/voice/) can inject without circular imports.
 * Providers: DeepgramSttService, SileroVadService, OpenAiTtsService,
 *             ElevenLabsTtsService, DiscordTtsService.
 */

import { Global, Module } from '@nestjs/common';
import { DeepgramSttService } from './deepgram-stt.service.js';
import { SileroVadService } from './silero-vad.service.js';
import { OpenAiTtsService } from './openai-tts.service.js';
import { ElevenLabsTtsService } from './elevenlabs-tts.service.js';
import { DiscordTtsService } from './discord-tts.service.js';

@Global()
@Module({
  providers: [
    DeepgramSttService,
    SileroVadService,
    OpenAiTtsService,
    ElevenLabsTtsService,
    DiscordTtsService,
  ],
  exports: [
    DeepgramSttService,
    SileroVadService,
    DiscordTtsService,
  ],
})
export class VoiceInfraModule {}
