# Parrott v2 — Implementation Status

> Sequenced build steps live in [`../plan.md`](../plan.md) (the orchestrator). Architecture in [`architecture.md`](architecture.md); parity gaps in [`gap-analysis.md`](gap-analysis.md); feature catalog + flags in [`features.md`](features.md). This file tracks granular state; keep all in sync.

Last updated: 2026-06-10

**Language:** All v2 implementation is TypeScript. v1 `agent/` stays as JavaScript.

Legend: ✅ Done · 🔲 Not started · 🚧 In progress

---

## Framework

| Item | Status | Notes |
|------|--------|-------|
| **NestJS as the shell** | ✅ | DI, lifecycle, cron, HTTP control edge, security. Hosts the bot. |
| **Necord for Discord** | ✅ | NestJS + discord.js. Voice still uses `@discordjs/voice` directly. |
| **Boundary rule: deps point inward** | ✅ | `core/` (Mastra) imports no Nest/Discord. See `architecture.md`. |
| **Config CRUD stays in Next.js** | ✅ | NestJS hosts brain + control endpoint only; dashboard→Supabase unchanged |
| Mastra as the framework-free core | ✅ | Replaces hand-rolled runner + memory layer |
| All `@ai-sdk/*` packages dropped from agentv2 | ✅ | Replaced by Mastra Model Router — string model IDs, no provider installs |
| Tool definitions use Mastra `createTool` | ✅ | Richer than AI SDK `tool()` — use exclusively |
| TypeScript for all v2 code | ✅ | `moduleResolution: nodenext` required (Mastra ESM under Nest) |
| Memory scope: `resourceId=userId`, `threadId=channelId` | ✅ | guildId dropped |

---

## Project setup

| Item | Status | Notes |
|------|--------|-------|
| NestJS app scaffold (`src/`, `nest-cli.json`) | 🔲 | |
| `tsconfig` `moduleResolution: nodenext` | 🔲 | ⚠️ Required or `@mastra/core/*` imports fail — see `architecture.md` |
| Installs: NestJS, Necord, `@nestjs/schedule`, `@mastra/core/memory/pg` | 🔲 | |
| Necord wired with gateway intents + `@Once('ready')` | 🔲 | |
| ESM proof: `@mastra/core/agent` imports + runs under Nest | 🔲 | Task 1 acceptance gate |
| supabase-js client wired (`infra/supabase/`) | 🔲 | |

---

## DB Layer

| Item | Status | Notes |
|------|--------|-------|
| Personality config source | ✅ | Reuse v1's existing live `parrot_*` tables — **no new migration**. `db/personality/personality.sql` is superseded/reference-only |
| Mastra Postgres storage tables | 🔲 | Auto-created by `@mastra/pg` on first run |
| pgvector extension enabled in Supabase | 🔲 | Required for semantic recall |
| Mastra PgVector table setup | 🔲 | ⚠️ Known rough edges with Supabase — see note below |
| New: channel-allowlist/rate-tier table (`parrot_*`) | 🔲 | G2 — **new migration** (dashboard-editable); unlike personality which reuses existing tables |
| New: `parrot_feature_flags` table | 🔲 | Feature catalog gate (key/category/enabled/status). New migration. See `features.md` |

**⚠️ Supabase + PgVector note:** Open issues in Mastra's repo around SSL config and table auto-creation. Solved by: `?sslmode=require` on connection string + manual migration for the vector table. See `memory-plan.md` for details. HNSW index required for good query performance.

---

## Core — Agent & Tools

| Item | Status | Notes |
|------|--------|-------|
| Remember-guidance doc | ✅ | `tools/remember/remember.md` — folds into agent instructions + working-memory template, NOT a separate tool |
| Mastra Agent defined (`core/agents/parrott.ts`) | 🔲 | Instantiated in a NestJS provider (singleton). Instructions from DB, tools, memory |
| Core ports (`core/ports/`) | 🔲 | `IncomingMessage`, `Replier`, `VoiceSink` — adapters implement them |
| `FeatureFlagService` (Nest provider, cached) | 🔲 | `isLive(key)` = `enabled && status==='live'`; gates every feature. See `features.md` |
| Memory config (storage + vector + **embedder**) | 🔲 | `embedder` is required for semantic recall — easy to miss. See memory-plan.md |
| Working-memory template seeded from remember.md | 🔲 | Markdown template drives built-in `updateWorkingMemory` |
| Personality provider (`infra/personality.service.ts`) | 🔲 | Nest provider; reads v1 `parrot_*` tables (reuse v1 query shape), caches 30–60s |
| `formatPersonalityMarkdown()` formatter | 🔲 | Fields → structured markdown (`## Role/Voice/Task/Constraints/Tools`). Replaces v1's flat space-join. Composes with Mastra memory blocks |
| ~~Custom remember tool~~ | ➖ | Dropped — Mastra's built-in `updateWorkingMemory` covers it |
| `sing_song` tool (TS) | 🔲 | |
| `search_web` tool (TS) | 🔲 | |
| `create_timer` tool (TS) | 🔲 | |
| `run_roast` tool (TS) | 🔲 | |
| `make_joke_like` tool (TS) | 🔲 | |

---

## Platform — Discord (Necord) & Shell

| Item | Status | Notes |
|------|--------|-------|
| Mention adapter (`platforms/discord/mention.update.ts`) | 🔲 | Necord `@On('messageCreate')` → plain `IncomingMessage` → agent → **placeholder + single edit** (G5). Implements `Replier` |
| Multi-user thread mapping | 🔲 | `thread = discord:${channelId}`, `resource = discord:${senderId}` |
| Voice adapter (`platforms/discord/voice/`) | 🔲 | `@discordjs/voice` w/ Necord client. STT → `agent.stream()` → TTS. Implements `VoiceSink` |
| Activity adapter (`platforms/discord/activity/`) | 🔲 | Necord presence/voice-state → **direct model call** (not full agent) → deliver |
| Cron jobs → `@nestjs/schedule` (`src/jobs/`) | 🔲 | Port v1 `node-cron` (announcements, voice-quick-comment) |
| Control endpoint (`src/control/`) | 🔲 | Guarded: `reload`/`state`/`trigger`. Next.js calls it; replaces `restart_requests` poll |
| Discord-only tools (`join_voice`) | 🔲 | `platforms/discord/` — poll removed from v2 |
| Dashboard Features page (`client/app/features/`) | 🔲 | Toggle features + status badges; drills into granular flags. Client work (Task 8) |

---

## Infra

| Item | Status | Notes |
|------|--------|-------|
| TTS service (`infra/tts.service.ts`) | 🔲 | ElevenLabs |
| STT service (`infra/stt.service.ts`) | 🔲 | OpenAI Whisper |

---

## Parity gaps (second-pass review — see [`gap-analysis.md`](gap-analysis.md))

| # | Gap | Pri | Folds into | Status |
|---|-----|-----|-----------|--------|
| G1 | Write `parrot_conversation_history` + `logs` (dashboard reads these) | 🔴 | Task 3 / Task 1 | 🔲 |
| G2 | Channel allowlist + tiers + rate limiting — **decided: new dashboard-editable `parrot_*` table** | 🔴 | Task 3 | 🔲 |
| G3 | Per-tool response delivery (text/voice/both) | 🔴 | Task 4/5 | 🔲 |
| G4 | Blocked-role permission gate | 🔴 | Task 3 | 🔲 |
| G5 | Reply pattern — **decided: placeholder + single edit** (no token streaming to Discord) | ✅ decided | Task 3 | 🔲 |
| G6 | Error handling & resilience (LLM fail, voice recovery) | 🟡 | Task 3/5 | 🔲 |
| G7 | Lint-enforce boundary rule (`core/` imports) | 🟡 | Task 1 | 🔲 |
| G8 | Spike validates all Mastra tables (thread/message/WM/vector) | 🟡 | Task 0 | 🔲 |
| G9 | Testing strategy/tiers | 🟡 | Task 1 | 🔲 |
| G11 | **Activity parity** — tracking, dedup, cooldown, DM opt-out, delivery, logging | 🔴 | Task 6 | 🔲 |
| G12 | **Voice parity** — session lifecycle, keyword trigger, single-turn, quick-comment | 🔴 | Task 5 | 🔲 |
| G10 | Notes: intent shortcuts, slash-cmd vs tool, multi-guild, cron jobs | ⚪ | various | 🔲 |

---

## Decisions made

- **Backend = NestJS shell** hosting a framework-free Mastra core, with discord.js via **Necord** as the adapter. Ports-and-adapters; deps point inward (`core/` imports no Nest/Discord). See `architecture.md`.
- **Config CRUD stays in Next.js → Supabase** (unchanged). NestJS owns the brain + a control endpoint, not config editing — avoids duplicating working code + re-doing Supabase-session auth.
- **Personality/prompt config** → **Reuse v1's existing `parrot_*` tables** as-is, resolved dynamically per-turn (see below). Granular dashboard control preserved.
- **Cutover** → v2 **replaces v1's core runtime only**. Dashboard + all Supabase tables stay.
- **ESM/CJS** → `moduleResolution: nodenext` in agentv2 tsconfig (Mastra is ESM-first; Nest defaults to CommonJS). Proven in Task 1.

## Open questions

| # | Question | Status |
|---|----------|--------|
| 4 | **Deployment target** — Railway / Fly.io / Docker on a VM / existing host? | 🔲 deferred (doesn't block early build) |
| 5 | **Voice ↔ memory mapping (G12)** — keep v1 session-local `messageHistory`, or route voice through Mastra memory (`thread = discord:${channelId}`, shared with text)? Lean: Mastra memory for consistency. | 🔲 decide at Task 5 |

**Personality wiring (decided):** Resolve instructions + model from `parrot_*` tables **dynamically per-turn** via Mastra `runtimeContext` functions (`instructions: ({ runtimeContext }) => ...`, `model: ({ runtimeContext }) => ...`), fronted by a **30–60s TTL cache**. Live dashboard edits, no restart needed, minimal per-turn latency. Reference: [Mastra Dynamic Agents](https://mastra.ai/blog/dynamic-agents).

---

## Gaps now covered in plans

- ✅ Embedder config documented (was missing — semantic recall needs it)
- ✅ Mention reply pattern decided: placeholder + single edit (G5) — avoids Discord edit-rate-limit
- ✅ Multi-user thread / resource mapping documented
- ✅ Built-in `updateWorkingMemory` replaces custom remember tool
- ✅ NestJS shell + Necord + boundary rule + connection map documented (`architecture.md`)
- ✅ ESM/CJS gotcha + fix captured (`moduleResolution: nodenext`) — Task 1 gate

---

## What to build next

Sequenced tasks with acceptance gates live in [`../plan.md`](../plan.md). **Task 0 (Supabase + Mastra memory spike) is first** — it de-risks the one load-bearing unknown before any other code.
