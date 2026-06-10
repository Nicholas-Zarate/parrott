// reflect-metadata MUST be the first import — required for NestJS DI + decorators
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  SupabaseLoggerService,
  DEFAULT_LOG_LEVELS,
} from './infra/logger/supabase-logger.service.js';

async function bootstrap(): Promise<void> {
  const logger = new SupabaseLoggerService();
  logger.setLogLevels(DEFAULT_LOG_LEVELS);

  const app = await NestFactory.create(AppModule, {
    logger,
    // The Discord bot doesn't need an HTTP server on a specific port unless
    // the control endpoint (Task 7) is active. Listen on PORT or skip.
    bufferLogs: true,
  });

  // Graceful shutdown — NestJS will call OnModuleDestroy on all providers
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);

  logger.log(`Parrott v2 listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
