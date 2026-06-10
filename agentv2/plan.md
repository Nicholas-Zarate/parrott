# Parrott v2 — Build Plan (Orchestrator)

This is the **main runner** for v2. It sequences the work and points to the detailed docs.
Work top-to-bottom. Each task has an acceptance check — don't advance until it passes.

## Reference docs

| Doc | What it holds |
|-----|---------------|
| [`CLAUDE.md`](CLAUDE.md) | Project orientation, tech stack, folder structure, key decisions |
| [`docs/architecture.md`](docs/architecture.md) | Ports & adapters, boundary rule, connection map, **ESM/CJS gotcha + fix** |
| [`docs/gap-analysis.md`](docs/gap-analysis.md) | **Second-pass review** — parity gaps (allowlist, rate limit, delivery routing, dashboard-compat writes) folded into tasks |
| [`docs/features.md`](docs/features.md) | **Feature catalog + flags** — taxonomy, `parrot_feature_flags` schema, status lifecycle |
| [`docs/status.md`](docs/status.md) | Living status tables, decisions log, open questions |
| [`docs/memory-plan.md`](docs/memory-plan.md) | Memory design: two stores, config, multi-user scope, Supabase issues |
| [`tools/remember/remember.md`](tools/remember/remember.md) | What's worth remembering → feeds agent instructions + WM template |

## Locked decisions (see status.md for full log)

- **Shell:** NestJS (DI, lifecycle, cron via `@nestjs/schedule`, HTTP control edge). **Discord:** Necord (NestJS + discord.js). **Core:** Mastra, framework-free.
- **Boundary rule:** deps point inward — NestJS → platforms → core. `core/` imports nothing above it; no Discord/Nest objects in core types. See [`docs/architecture.md`](docs/architecture.md).
- **AI core:** Mastra. Model Router (string IDs, no `@ai-sdk/*`). `createTool` for tools. **Mention replies: placeholder + single edit** (not per-token streaming to Discord — G5); `agent.stream()` may be used internally (e.g. voice).
- **Language:** TypeScript, all of v2. `moduleResolution: nodenext` (required for Mastra ESM under Nest).
- **Memory:** `@mastra/pg` storage + `PgVector` + `ModelRouterEmbeddingModel` embedder. `thread = discord:${channelId}`, `resource = discord:${senderId}`. Built-in `updateWorkingMemory` (no custom remember tool).
- **Personality:** reuse v1 `parrot_*` tables, resolved dynamically per-turn via `runtimeContext` + 30–60s cache. **Config CRUD stays in Next.js** — NestJS hosts the brain + control endpoint only.
- **Feature flags:** every feature runs behind a `parrot_feature_flags` gate — active only if `enabled && status==='live'` (`FeatureFlagService.isLive(key)`). See [`docs/features.md`](docs/features.md).
- **Cutover:** replace v1 **core runtime only**; dashboard + Supabase tables stay.

## Open (not blocking)

- Deployment target — deferred. Pick before production cutover.

## Prerequisites (before Task 0)

- **Env vars** — full list in [`CLAUDE.md`](CLAUDE.md) § "Env vars for v2". Task 0 needs at minimum `DATABASE_URL` (Supabase pooler) and `OPENAI_API_KEY` (embeddings). Task 1+ also needs `DISCORD_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **`tsconfig.json`:** `moduleResolution: "nodenext"` + `module: "nodenext"` — **required** or `@mastra/core/*` imports fail under NestJS (CommonJS). See [`docs/architecture.md`](docs/architecture.md) § ESM gotcha.
- **Discord gateway intents** — set in `NecordModule.forRoot`: `Guilds, GuildMembers, GuildPresences, GuildMessages, MessageContent, GuildVoiceStates` + partials `Channel, Message`. See [`CLAUDE.md`](CLAUDE.md).
- **v1 stays running** — v2 is built alongside `agent/` (untouched). Use a separate bot token / test server until cutover (Task 9).

---

# Tasks

> Legend: ⬜ todo · 🟡 in progress · ✅ done
>
> **Feature-flag rule (all feature tasks 3–6):** each feature is built behind its `parrot_feature_flags` row. On task start, set its `status='wip'`; on acceptance, flip to `status='live'`. Nothing ships active until its flag is `live`. See [`docs/features.md`](docs/features.md).

## Task 0 — Supabase + Mastra memory spike ⬜ (DO FIRST)

**Why first:** The one load-bearing unknown. Mastra's `PgVector` has documented friction with Supabase (`embeddings`/`vector_id` table, SSL). Prove this path before building anything on it. See [`docs/memory-plan.md`](docs/memory-plan.md) § "Supabase + PgVector known issues".

**Do:** (standalone throwaway script — plain TS, **not** the Nest app yet; isolates the DB risk)
1. Minimal TS project (package.json, tsconfig with `moduleResolution: nodenext`). Install `@mastra/core`, `@mastra/memory`, `@mastra/pg`.
2. Enable `vector` extension in Supabase.
3. Throwaway script: construct `Memory` with `PgStore` (⚠️ verify `PgStore` vs `PostgresStore` export — resolving this is a goal of this task) + `PgVector` + `ModelRouterEmbeddingModel`, using `process.env.DATABASE_URL` (Supabase pooler URL, `?sslmode=require`).
4. Write one message to a thread (`resource`/`thread` set), then read it back. Trigger a semantic-recall query.

**Acceptance:** (validate **all** Mastra tables, not just vector — see gap-analysis G8)
- [ ] Thread auto-creates; a message round-trips; working memory persists across two calls; semantic recall returns — all against Supabase, no errors
- [ ] Every actual table name + schema Mastra creates is recorded into `docs/memory-plan.md`
- [ ] Exact working import names (`PgStore` vs `PostgresStore`) + connection string format recorded back into `docs/memory-plan.md`

**On failure:** capture the exact error in `docs/memory-plan.md`; evaluate fallback (separate managed Postgres — Neon/Railway) before proceeding.

---

## Task 1 — NestJS scaffold + ESM proof ⬜

Scaffold the real app per [`CLAUDE.md`](CLAUDE.md) § Folder structure: NestJS app with `src/core/` (framework-free), `src/platforms/discord/`, `src/infra/`. Install NestJS, **Necord**, `@nestjs/schedule`. Set `tsconfig` `moduleResolution: "nodenext"` + `module: "nodenext"`. Wire Necord with the gateway intents. `main.ts` calls `enableShutdownHooks()`. Vitest set up. supabase-js client in `infra/supabase/`.

**Why the ESM proof matters:** this is the load-bearing integration risk (Mastra ESM vs Nest CommonJS — see [`docs/architecture.md`](docs/architecture.md) § ESM gotcha). Prove it before building on it.

**Acceptance:**
- [ ] `import { Agent } from '@mastra/core/agent'` **compiles and runs** inside the Nest app (proves the ESM/`moduleResolution` fix)
- [ ] Bot connects via Necord `@Once('ready')`; a stub `@On('messageCreate')` logs
- [ ] Graceful shutdown: `OnModuleDestroy` disconnects Discord + closes resources cleanly
- [ ] **Boundary enforced by lint (G7):** ESLint `no-restricted-imports` (or dependency-cruiser) **fails** if `core/**` imports `@nestjs/*`, `discord.js`, `necord`, or `@discordjs/*`
- [ ] **Logger transport (G1):** NestJS logger also writes structured rows to the `logs` table (keeps the dashboard logs page alive)
- [ ] Vitest harness runs; testing tiers defined per gap-analysis G9

---

## Task 2 — Parrott agent (text only) ⬜

Define `core/agents/parrott.ts`, **instantiated inside a NestJS provider** (singleton — avoids the Mastra-in-DI beta rough edges). Dynamic `instructions` + `model` from `parrot_*` tables via `runtimeContext`, 30–60s cache. Memory config from Task 0. Working-memory template seeded from [`remember.md`](tools/remember/remember.md). Define core ports in `core/ports/` (`IncomingMessage`, `Replier`, `VoiceSink`).

**Personality layer (`infra/personality.service.ts` — a Nest provider):**
- Read the existing `parrot_*` tables (reuse v1's query shape — see `agent/database/supabase/parrot-tones.js`, `prompt-sections.js`). Granular dashboard edits already write these; do NOT introduce a new personality table.
- **`formatPersonalityMarkdown(fields)`** (in `core/personality/`) — emits **structured markdown** (`## Role`, `## Voice`, `## Task`, `## Constraints`, `## Tools`), replacing v1's flat space-join (`buildSystemPrompt` in `agent/config/parrot.js:203`). Clear section boundaries + composes with Mastra's markdown memory blocks.
  - ⚠️ **Behavior-change risk:** this changes the exact prompt the model sees vs v1 — in a "parity" migration the bot's voice may shift subtly. **Eyeball it:** generate replies for a few representative prompts with old (space-join) vs new (markdown) formatting and confirm the personality still feels right before locking it in.
- `model` resolved from `parrot_runtime_config`. ⚠️ **Format mismatch:** v1 stores bare ids (`gpt-4o-mini`); Model Router needs a provider prefix (`openai/gpt-4o-mini`). Add a small mapping layer (prefix bare ids by known provider) **or** a one-time data migration of the column. Decide which; mapping layer is safer (no destructive migration).
- 30–60s TTL cache so per-turn `runtimeContext` resolution doesn't hit Supabase every message.

**Feature-flag foundation (see [`docs/features.md`](docs/features.md)):**
- Create the `parrot_feature_flags` migration (key, label, category, enabled, status, description) and seed one row per catalogued feature (most `status='planned'`).
- Build `FeatureFlagService` (Nest provider, cached like personality) exposing `isLive(key)` = `enabled && status==='live'`. Every feature task gates on it.

**Acceptance:** Get a personality-shaped reply assembled as markdown from the live `parrot_*` tables; editing a tone/section in the DB changes the prompt within the cache window; a fact persists to working memory and is recalled on a second turn; `FeatureFlagService.isLive('capability.memory')` gates the memory path.

---

## Task 3 — Mention adapter ⬜

`platforms/discord/mention.update.ts`: Necord `@On('messageCreate')` → translate to plain `IncomingMessage` → map `thread`/`resource` → run agent → reply via **placeholder + single edit** (adapter implements the core `Replier` port). Multi-user thread mapping per memory-plan. The Discord `Message` object never reaches `core/`.

**Parity gates this path must include (see `docs/gap-analysis.md`):**
- **Pre-run gates (NestJS guards):** channel allowlist + tier (G2 — **from a new dashboard-editable `parrot_*` table**), blocked-role check (G4), per-user/tier rate limit with resting message (G2).
- **Reply pattern (G5 — decided):** send a placeholder, **await the complete reply, edit once.** No per-token editing.
- **Delivery routing (G3):** compute `doText`/`doVoice` from called tools' `response_delivery` metadata.
- **Dashboard-compat write (G1):** after each turn, write a `parrot_conversation_history` row (port v1 `saveConversation` shape) so the dashboard history page stays populated.
- **Error fallback (G6):** friendly user-facing message on agent failure (NestJS exception filter).

**Acceptance:** Live @mention gets a reply (placeholder → single edit); memory works across turns; personality matches dashboard; allowlist/role/rate-limit gates enforced; a `parrot_conversation_history` row is written and shows on the dashboard; `core/` received only plain types.

---

## Task 4 — Core tools ⬜

Port to TS `createTool` in `core/tools/`: `sing_song`, `search_web`, `create_timer`, `run_roast`, `make_joke_like`. Tool descriptions injected from `parrot_tool_descriptions`. Decide which user-facing commands are Necord `@SlashCommand`s vs agent tools (gap-analysis G10). Implement per-tool **response delivery routing** (text/voice/both) from `tools_meta_data.response_delivery` (G3).

**Acceptance:** Each tool callable by the agent end-to-end; descriptions reflect the DB; delivery routing (text/voice/both) matches each tool's metadata.

---

## Task 5 — Voice adapter ⬜

`platforms/discord/voice/` (uses `@discordjs/voice` with the Necord-managed client) + `infra/stt.service.ts` (Whisper) + `infra/tts.service.ts` (ElevenLabs). Adapter implements the core `VoiceSink` port. Reuse v1's Opus→PCM→ffmpeg pipeline learnings (see `../docs/voice-pipeline-findings-and-changes.md`). STT → agent → TTS. `join_voice` Discord-only tool.

**Voice parity to port (G12 — see `docs/gap-analysis.md`):** one session/guild + state; `voice_sessions`/`voice_session_turns` persistence; **auto-end on disconnect**; keyword trigger "parrot(t)" + expect-next-utterance; **single in-flight turn guard**; separate `voice_model`; voice↔Mastra memory mapping decision. Quick-comment job → Task 6.

**Acceptance:** "hey parrott …" in VC → spoken reply; session lifecycle + keyword trigger + single-turn guard work; same agent/memory as text; session row persisted.

---

## Task 6 — Activity adapter + cron jobs ⬜

`platforms/discord/activity/`: Necord presence/voice-state listeners → trigger detection → short reaction → deliver (channel/DM/voice). Port v1's `node-cron` jobs (announcements, voice-quick-comment) to **`@nestjs/schedule`** in `src/jobs/`.

⚠️ **Decision — lightweight call, not the full agent.** v1 generates the 6–9 word reaction with a **direct model call + prompt template + static fallback** (`deliver.js`), *not* the agent/tool/memory loop. Keep it that way: a direct Model Router call (personality role/voice/constraints only) with the v1 fallback. Routing reactions through the full Mastra agent would add latency, tool exposure, and pollute per-user memory with bot-initiated noise.

**Activity parity to port (G11 — see `docs/gap-analysis.md`):** in-memory tracking state (gameStartTimes/lastSeen) + pruning; per-user concurrency lock; 7 trigger types + late_night/game_start dedup; per-(user,trigger) cooldown; reuse `activity_trigger_settings` (DB→file); 3 delivery channels incl. **DM with blocked-role + `user_dm_preferences` opt-out**; per-trigger AI prompt + **static fallbacks**; event logging to `activity_listeners`.

**Acceptance:** All 7 triggers fire/dedup/cooldown correctly; delivery respects per-trigger settings + DM opt-out; fallbacks work when LLM down; events logged; scheduled jobs run on the Nest scheduler.

---

## Task 7 — Control endpoint ⬜

Guarded NestJS controller in `src/control/`: `reload` (bust **all cached config** — personality + feature flags now), `state` (live voice sessions / status), `trigger` (manual action). Guard with a shared secret or Supabase JWT. Point Next.js `client/app/api/request-restart/route.ts` at this endpoint — replaces v1's `restart_requests` DB-poll.

**Acceptance:** Dashboard "reload" reflects in the bot within seconds (no restart); `state` returns live status; endpoint rejects unauthenticated calls.

---

## Task 8 — Dashboard Features page (client) ⬜

Next.js page `client/app/features/`: reads/writes `parrot_feature_flags` via Supabase (like other config). Grouped by category (Surface/Tool/Autonomous/Capability) with an `enabled` switch + `status` badge per row; expand Tools / Activity to drill into existing granular flags (`tools_meta_data.enabled`, `activity_trigger_settings.enabled`). Lower priority than the bot — can land after parity. See [`docs/features.md`](docs/features.md).

**Acceptance:** Admin can toggle a feature's `enabled` + see its `status`; the bot honors `isLive(key)` within the cache window; granular tool/trigger drill-downs work.

---

## Task 9 — Cutover ⬜

Reach parity with v1, then swap the running bot to v2. Dashboard + tables unchanged. Decide deployment target (open question) before this.

**Rollback plan:** keep v1 (`agent/`) deployable for fast revert — **do not delete it at cutover.** Cut over by switching the bot token / process to v2; if v2 regresses, switch back to v1 (same token, same Supabase tables — they share the DB, so no data migration either way). Retire v1 only after v2 has run clean for an agreed window (e.g. 1–2 weeks).

**Acceptance:** v2 handles all live abilities in production; v1 remains revertible until the soak window passes.

---

## How to update this file

When a task completes, flip its ⬜ → ✅ here AND update the matching rows in [`docs/status.md`](docs/status.md). This file = sequence + acceptance gates; status.md = granular state. Keep both in sync.
