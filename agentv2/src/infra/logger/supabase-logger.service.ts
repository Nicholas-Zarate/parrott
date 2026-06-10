import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { getSupabaseAdmin } from '../supabase/client.js';

/**
 * Custom NestJS logger that writes to both stdout AND the Supabase `logs` table.
 * Pass to NestFactory.create({ logger: new SupabaseLoggerService() }).
 *
 * Supabase writes are fire-and-forget (async, non-blocking) — a failed write
 * never crashes the app. Errors in the logger itself go only to stderr.
 *
 * Dashboard reads: client/app/logs/page.tsx → `logs` table (level, message, meta).
 */
export class SupabaseLoggerService extends ConsoleLogger {
  private readonly writeToDb: boolean;

  constructor() {
    super();
    // Only write to DB if Supabase env vars are present (skips during unit tests)
    this.writeToDb = Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }

  override log(message: string, context?: string): void {
    super.log(message, context);
    this.#push('info', message, context);
  }

  override warn(message: string, context?: string): void {
    super.warn(message, context);
    this.#push('warn', message, context);
  }

  override error(message: string, trace?: string, context?: string): void {
    super.error(message, trace, context);
    this.#push('error', message, context, trace ? { trace } : undefined);
  }

  override debug(message: string, context?: string): void {
    super.debug(message, context);
    this.#push('debug', message, context);
  }

  override verbose(message: string, context?: string): void {
    super.verbose(message, context);
    this.#push('debug', message, context);
  }

  #push(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!this.writeToDb) return;

    const row = {
      level,
      message: context ? `[${context}] ${message}` : message,
      meta: meta ?? null,
    };

    // Fire-and-forget — never await; log failures are silently swallowed
    getSupabaseAdmin()
      .from('logs')
      .insert(row)
      .then(({ error }) => {
        if (error) {
          // Only stderr — don't recurse into the logger
          process.stderr.write(
            `[SupabaseLogger] DB write failed: ${error.message}\n`,
          );
        }
      });
  }
}

/** Levels forwarded to Supabase. Verbose is noisy; exclude in prod via LOG_LEVEL. */
export const DEFAULT_LOG_LEVELS: LogLevel[] = ['log', 'warn', 'error'];
