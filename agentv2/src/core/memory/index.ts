/**
 * Mastra memory configuration — framework-free.
 *
 * Two-store approach (see docs/memory-plan.md):
 *   - PostgresStore  → conversation + working memory
 *   - PgVector       → semantic recall (embeddings)
 *
 * Scope helpers are in ./memory-scope.ts (importable without DATABASE_URL for tests).
 *
 * Boundary rule: no @nestjs/*, discord.js, or necord imports.
 */

import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

export { buildMemoryScope } from './memory-scope.js';

// Supabase pooler TLS — cert not in Node trust store (see memory-plan.md § SSL fix)
const pgPoolOptions = { ssl: { rejectUnauthorized: false } };

let _memory: Memory | null = null;

/**
 * Returns the singleton Mastra Memory instance.
 * Lazily initialised on first call so tests that don't need real memory
 * can import scope helpers without requiring DATABASE_URL.
 *
 * Called at module init time inside ParrottAgentProvider.onModuleInit(),
 * so DATABASE_URL is guaranteed to be set when it actually runs.
 */
export function getParrottMemory(): Memory {
  if (_memory) return _memory;

  const DATABASE_URL = process.env['DATABASE_URL'];
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL env var is required for Mastra memory');
  }

  _memory = new Memory({
    storage: new PostgresStore({
      id: 'parrott-storage',
      connectionString: DATABASE_URL,
      pgPoolOptions,
    }),

    vector: new PgVector({
      id: 'parrott-vector',
      connectionString: DATABASE_URL,
      pgPoolOptions,
    }),

    // Required for semantic recall — without an embedder it silently won't work.
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),

    options: {
      // Inject the N most recent messages into every turn.
      lastMessages: 20,

      semanticRecall: {
        topK: 5,
        messageRange: 2, // include 2 surrounding messages for context
        indexConfig: {
          type: 'hnsw',         // better than IVFFlat default
          metric: 'dotproduct', // correct for OpenAI embeddings
          hnsw: { m: 16, efConstruction: 64 },
        },
      },

      workingMemory: {
        enabled: true,
        // 'resource' = facts follow the user across channels (per-sender, not per-channel)
        scope: 'resource',
      },
    },
  });

  return _memory;
}
