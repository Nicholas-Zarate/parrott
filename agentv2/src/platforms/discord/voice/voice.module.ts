/**
 * VoiceModule — Discord voice adapter (Necord-managed client + voice pipeline).
 *
 * Wires VoiceSessionManager and exposes it to DiscordModule.
 *
 * The join_voice tool is registered with the agent inside
 * VoiceSessionManager.onModuleInit() (an @Injectable with a reliable DI path),
 * NOT here — NestJS does not resolve constructor injection on @Module classes
 * the same way it does on @Injectable providers.
 */

import { Module } from '@nestjs/common';
import { VoiceSessionManager } from './voice-session.manager.js';

@Module({
  providers: [VoiceSessionManager],
  exports: [VoiceSessionManager],
})
export class VoiceModule {}
