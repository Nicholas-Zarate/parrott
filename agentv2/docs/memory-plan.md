# Parrott v2 — Memory Plan

## Goal

The bot should remember things the way a good friend in the group would: specific facts about people, inside jokes, preferences, shared history — and be able to surface relevant past context even when it wasn't in the recent conversation. Two stores make this work together.

---

## Two-store approach

### Store 1 — Working memory (structured facts)

Persistent, structured data per user/channel. Things like:
- Names, nicknames, pronouns
- Preferences ("hates spoilers", "plays on console")
- Corrections the bot received ("actually it's X not Y")
- Commitments ("raid Saturday")
- Inside jokes and their triggers

**How it works in Mastra:** Working memory is injected into every turn as a special system block. The model reads it automatically and can update it by calling the `remember` tool. It persists across sessions.

**Storage:** `@mastra/pg` (PostgresStore) → Supabase Postgres.

**Scope:** `resourceId = userId`, `threadId = channelId`. Facts scoped to a user persist across any channel they appear in. Facts scoped to a channel are shared server-wide for that channel.

---

### Store 2 — Semantic recall (vector similarity)

Retrieves older messages and context that are semantically relevant to what the user just said, even if they happened days ago and aren't in the recent message window.

**How it works in Mastra:** Before each turn, the last user message is embedded and used to query the vector store. The top K most similar past messages (plus surrounding context) are injected into the prompt. All new messages are also inserted into the vector store for future recall.

**Storage:** `PgVector` (pgvector extension) → Supabase Postgres, same database.

**Scope:** Searchable within the current thread (`threadId = channelId`) by default, or across all threads for a user (`resourceId = userId`).

---

## Mastra configuration

> **Where this lives:** memory config sits in `core/memory` (framework-free). The Mastra agent that uses it is instantiated inside a **NestJS provider** (singleton) and injected where needed. The transport below (TCP Postgres) is unchanged by NestJS. See [`architecture.md`](architecture.md).

```typescript
import { Memory } from '@mastra/memory'
import { PgStore, PgVector } from '@mastra/pg'        // ⚠️ verify export name — see note
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const memory = new Memory({
  storage: new PgStore({
    id: 'parrott-storage',
    connectionString: process.env.DATABASE_URL,   // Supabase pooler URL, ?sslmode=require
  }),
  vector: new PgVector({
    id: 'parrott-vector',
    connectionString: process.env.DATABASE_URL,
  }),
  // REQUIRED for semantic recall — without an embedder it silently won't work
  embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 5,
      messageRange: 2,           // include 2 surrounding messages for context
      indexConfig: {
        type: 'hnsw',            // better than IVFFlat default
        metric: 'dotproduct',    // correct for OpenAI embeddings
        m: 16,
        efConstruction: 64,
      },
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',         // facts follow the user across channels (see scope decision below)
    },
  },
})
```

**⚠️ Import name:** Mastra's own docs are inconsistent — the semantic-recall example imports `PgStore` while the storage reference page uses `PostgresStore`. Verify the actual export in the installed `@mastra/pg` version before writing code. They may be aliases; do not assume.

Called per turn:
```typescript
const response = await parrottAgent.stream(messages, {
  memory: { resource: resourceId, thread: threadId },
})
```

**Note:** Both `resource` and `thread` must be passed or Mastra stores/recalls nothing. For **mention** replies, the agent result is consumed to completion and Discord gets a **placeholder + single edit** (no per-token editing — Discord edit-rate-limit; see gap-analysis G5). `agent.stream()` may still be used internally (e.g. voice, where TTS can start on sentence boundaries).

---

## Working memory updates — use the built-in tool

**Correction to earlier design:** Mastra ships a built-in `updateWorkingMemory` tool. When `workingMemory.enabled = true`, the agent calls it automatically to persist facts — **no custom `remember` tool is required.** The model decides when to update based on the working-memory template/schema and its instructions.

The guidance in `tools/remember/remember.md` (what's worth remembering) is still valuable — but it belongs in the **agent instructions / working-memory template**, not in a separate tool. Fold that guidance into the agent's `instructions` so it shapes when the model calls `updateWorkingMemory`.

We may still want a thin custom tool only if we need behavior the built-in doesn't cover (e.g. writing to a separate audit log). Default: rely on the built-in. Drop `core/tools/remember.ts` unless a concrete gap appears.

### Working memory template

Working memory uses a Markdown template (or Zod schema) that defines the shape of what's remembered. Seed it from the `remember.md` criteria, e.g.:

```
# User Profile
- Name/nickname:
- Pronouns:
- Preferences (games, music, timezone):
- Sensitivities / "don't mention":
- Inside jokes & triggers:
- Open commitments:
- Corrections received:
```

Semantic memory is automatic — Mastra embeds and inserts every message into the vector store with no tool call.

---

## Scope decision — per-user facts in shared channels

A Discord channel is shared by many users, but working memory is keyed to a single `resourceId`. Two options:

| Option | resourceId | Effect |
|--------|-----------|--------|
| **A — per sender (recommended)** | `discord:${senderUserId}` | Each user's facts are their own and follow them across channels. Mastra's documented pattern: everyone's messages still land in the same thread, so the agent reads the full channel conversation, but working memory is the current speaker's. |
| B — per thread-starter | `discord:${threadStarterId}` | One shared profile per channel. Simpler but conflates users — bad for a friend group where per-person memory is the whole point. |

**Go with A.** `threadId = discord:${channelId}` (shared conversation history), `resourceId = discord:${senderUserId}` (per-person working memory). This is exactly what the goal ("remember facts about each person") needs.

Reference: [Mastra — Building Multi-User, Multi-Channel Agents](https://mastra.ai/blog/building-multi-user-multi-channel-agents).

---

## Supabase vs separate Postgres

**Recommendation: stay on Supabase.**

The known rough edges (SSL config, table auto-creation) are setup-time problems, not runtime problems. Both are solved by:

1. **SSL** — append `?sslmode=require` to the connection string, or use Supabase's pooler URL directly.
2. **Table setup** — don't rely on Mastra's auto-init. Write the migration manually and run it once (see below).

For a friend-group Discord server the dataset will stay small (hundreds to low thousands of embeddings). The query performance issues in Mastra's issue tracker only appear at ~45k+ items. Using HNSW index (configured above) avoids the suboptimal query pattern reported in those issues.

Adding a separate Postgres (Neon, Railway, etc.) splits data across two databases, adds another service to maintain, and solves a problem we don't actually have.

---

## Supabase + PgVector known issues and resolutions

**Source:** [GitHub issue #6263](https://github.com/mastra-ai/mastra/issues/6263) — open as of June 2026.

### Issue 1 — SSL connection failure

Supabase requires SSL. Mastra's `PgVector` doesn't add it by default.

**Fix:** Use Supabase's connection pooler URL (Transaction mode, port 6543) which handles SSL, or append `?sslmode=require` to your `DATABASE_URL`:

```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

### Issue 2 — Table and column not found

Mastra's `PgVector` expects a specific table schema (`embeddings` table with a `vector_id` column). Against Supabase it fails to auto-create this table and throws:
- `relation "embeddings" does not exist`
- `column "vector_id" does not exist`

**Root cause:** Mastra has hardcoded schema assumptions that don't match Supabase's default pgvector setup.

**Fix:** Don't pre-create the table with a different schema. Let Mastra own the table entirely:
1. Enable the pgvector extension in Supabase (Dashboard → Database → Extensions → `vector`).
2. Check the exact expected schema in `@mastra/pg` source (`PgVector` class) before first run.
3. If Mastra still fails to auto-create, create the table manually using exactly the schema from source.
4. After the table exists, add the HNSW index manually:

```sql
create index if not exists mastra_embeddings_hnsw_idx
  on embeddings
  using hnsw (embedding vector_ip_ops);
```

**Note:** The table name (`embeddings`) and column name (`vector_id`) above are from issue #6263 — verify against current `@mastra/pg` source before running.

### Issue 3 — Suboptimal query performance (large datasets)

[Issue #14421](https://github.com/mastra-ai/mastra/issues/14421): Mastra's generated pgvector query doesn't always use the HNSW index. Only relevant at ~45k+ embeddings. At friend-group Discord scale this is not a concern.

**Fix if needed:** The `indexConfig: { type: 'hnsw', metric: 'dotproduct' }` config above is the correct mitigation.

---

## What this replaces from the v1 custom spec

| v1 spec concept | Mastra equivalent |
|----------------|------------------|
| Structured table (`memory`) | Working memory via `@mastra/pg` |
| Vector table + search RPC | Semantic recall via `PgVector` |
| `remember` tool (write both stores) | Built-in `updateWorkingMemory` tool (auto) + auto-insert for semantic |
| Runner fetches + injects memory block | Mastra handles automatically per turn |
| `memory_history` audit table | Not needed — Mastra's PostgresStore keeps full message history |

The v1 custom-memory schemas (`memory.sql`, `memory_history.sql`) and the `memory-spec.md` design doc have been **deleted** — Mastra fully replaces them. The only manual DB step left for personality is reading the existing `parrot_*` tables (no new migration needed). `db/personality/personality.sql` remains as a deprecated reference only.

---

## ⚠️ Cost, scale & retention (don't skip)

Memory is not free — it has real per-turn cost and unbounded growth that the friendly-friend-group framing hides:

- **Embedding spend.** Semantic recall embeds **every** stored message and runs a vector query each turn. On a chatty server that's a steady stream of `text-embedding-3-small` calls. Cheap per-call, but continuous.
- **Working-memory LLM calls.** The built-in `updateWorkingMemory` is an extra model call whenever the agent decides to persist a fact — on top of the reply itself.
- **Unbounded growth.** Messages + embeddings accumulate forever by default. Vector search slows as the table grows (HNSW helps, but the ~45k-row pain point from the PgVector issue is real if the server is busy for long enough).

**Mitigations to decide (not all needed day 1):**
- Cap semantic recall scope (`topK`, `scope: 'thread'`) — already configured small.
- **Retention policy:** periodically prune old messages/embeddings (e.g. keep N days or N per thread) via a `@nestjs/schedule` job. Not in any task yet — **add when memory volume becomes real.**
- Consider gating `capability.memory` semantic recall separately from working memory if cost spikes (the feature flag allows this).
- Watch OpenAI embedding usage after launch; it's the silent recurring cost.

**Verdict:** fine to launch without retention, but **flag it now** so it's a known follow-up, not a surprise bill or a slow bot in 6 months.
