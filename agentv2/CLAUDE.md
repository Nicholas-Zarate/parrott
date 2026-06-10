# Parrott v2 — Project Context

## What is Parrott?

Parrott is a Discord bot for a friend-group server. It responds to @mentions, hangs out in voice chat (STT → LLM → TTS), fires activity-triggered messages (game start, go live, comeback, etc.), and runs slash commands (roast). The goal is a bot that feels like a member of the group — it has personality, can remember things, and reacts to what people are doing.

## Repo layout

```
agent/      v1 bot — fully implemented and running
agentv2/    v2 — build plan + design docs (no runtime code yet)
client/     Next.js dashboard (settings, personality, logs, activities) — shared by v1 and v2
docs/       v1 planning docs (root) — see voice-pipeline-findings for v2 voice porting
instructions/ v1 one-off fix plans (root)
```

## v2 scope

v2 is a TypeScript rewrite of the bot core as a **NestJS application** with **Mastra** as the framework-free AI core. Nothing in `agent/` is replaced yet — v2 is built alongside it.

Three layers (ports & adapters — see `docs/architecture.md`):
- **Shell = NestJS** — DI, lifecycle/graceful shutdown, cron (`@nestjs/schedule`), the HTTP control edge, security.
- **Adapter = discord.js via Necord** (+ `@discordjs/voice`) — translates Discord events ↔ core.
- **Core = Mastra** — the brain: agent loop, tools, memory. Knows nothing about Discord or NestJS.

v2 adds on top:
1. **Memory** — `resourceId = discord:${senderId}`, `threadId = discord:${channelId}`. Backed by Supabase Postgres + pgvector. Working memory is per-user; conversation history is per-channel. See `docs/memory-plan.md`.
2. **Working memory** — built-in Mastra `updateWorkingMemory` tool (no custom remember tool); semantic recall auto-inserts every message.
3. **Personality from DB** — **reuses v1's existing `parrot_*` tables** (`parrot_tones`, `parrot_prompt_sections`, `parrot_tool_descriptions`, `parrot_runtime_config`, `parrot_voice_dimensions`). v2 resolves agent `instructions` + `model` from these **dynamically per-turn** via Mastra `runtimeContext` functions, with a 30–60s cache (live dashboard edits, no restart). The `db/personality/personality.sql` table is **superseded** — kept as reference only, not applied.
4. **Discord adapter** — Necord events translated into agent calls. Mention replies use **placeholder + single edit** (not per-token streaming — Discord edit-rate-limit). See `docs/gap-analysis.md` G5.

**Config stays in Next.js.** Personality/keyword editing remains in the dashboard → Supabase (unchanged). NestJS does **not** own config CRUD — it hosts the brain + a control endpoint only.

**Cutover:** v2 replaces v1's **core runtime only**. The Next.js dashboard and all Supabase tables stay unchanged.

## Architecture principle (the boundary rule)

> **Core depends on Mastra only.** discord.js/Necord is confined to `platforms/discord/`. NestJS is confined to the shell (modules/providers/controllers). Core types are plain (text, audio, scope ids) — no Discord or Nest objects cross into `core/`. The core defines **ports** (interfaces); adapters implement them.

Ports live in `core/ports/`: `IncomingMessage` (plain `{ text, userId, channelId, ... }`), `Replier` (text out), `VoiceSink` (audio out). This keeps the core portable — a future platform is a new adapter, `core/` unchanged. Full diagram + connection map in [`docs/architecture.md`](docs/architecture.md).

## Agent framework

**Mastra** (mastra.ai) — TypeScript-first, open source, 1.0 released January 2026. Used as the **framework-free core** (no Nest/Discord imports inside it).
- Models via Mastra **Model Router** (string IDs, no `@ai-sdk/*` packages)
- `createTool` for all tool definitions; mention replies use placeholder + single edit (G5), `agent.stream()` available for internal use (voice)
- Memory: `@mastra/pg` storage (conversation + working memory) + `PgVector` (semantic recall) + `ModelRouterEmbeddingModel` embedder. See `docs/memory-plan.md`.
- Instantiated inside a **NestJS provider** (singleton), not scattered `new Agent()` calls.

**Shell:** NestJS (long-running process, Docker/PM2/Railway). **Discord:** Necord. **Cron:** `@nestjs/schedule`.

⚠️ **ESM gotcha:** Mastra is ESM-first, NestJS defaults to CommonJS. Set `moduleResolution: "nodenext"` (+ `module: "nodenext"`) in the agentv2 `tsconfig.json` or `@mastra/core/*` imports break. See [`docs/architecture.md`](docs/architecture.md).

## Folder structure

```
agentv2/
  src/
    main.ts                  ← Nest bootstrap (enableShutdownHooks)
    app.module.ts
    core/                    ← Mastra, framework-free — NO nest/discord imports
      agents/parrott.ts
      tools/                 ← createTool: sing_song, search_web, create_timer, run_roast, make_joke_like
      memory/                ← Memory config (PgStore + PgVector + ModelRouterEmbeddingModel)
      personality/           ← formatPersonalityMarkdown + types
      ports/                 ← Replier, VoiceSink, IncomingMessage
    platforms/discord/       ← Necord module; adapters implement core ports
      mention.update.ts      ← Necord @On('messageCreate') → agent → placeholder + single edit
      voice/                 ← @discordjs/voice pipeline (implements VoiceSink)
      activity/              ← presence/voice-state listeners → direct model call (not full agent) → deliver
      discord.module.ts
    infra/
      supabase/              ← supabase-js client (reads parrot_* config)
      personality.service.ts ← dynamic config provider (30–60s TTL cache)
      tts.service.ts, stt.service.ts
    control/                 ← Nest HTTP controller (guarded): reload, state, trigger
    jobs/                    ← @nestjs/schedule cron (announcements, voice-quick-comment)
  tsconfig.json              ← moduleResolution: nodenext  (ESM gotcha fix)
  nest-cli.json, package.json
```

## Connections (transports)

Most links are **not** HTTP. Gateway = WebSocket, voice = UDP, memory = TCP Postgres, config = HTTPS REST. FE↔BE share Supabase (no direct config calls); the only FE→BE call is the optional guarded control endpoint. Full table in [`docs/architecture.md`](docs/architecture.md) § Connection map.

## Current v2 state

All design work done. Zero runtime code written. See `agentv2/docs/status.md` for the full breakdown.

## Key v2 files

| File | Purpose |
|------|---------|
| `agentv2/plan.md` | **Start here** — build orchestrator: sequenced tasks + acceptance gates, references all other docs |
| `agentv2/docs/architecture.md` | **Architecture** — ports & adapters, boundary rule, connection map, ESM/CJS gotcha + fix |
| `agentv2/docs/gap-analysis.md` | **Second-pass review** — v1 parity gaps (allowlist, rate limit, delivery routing, dashboard-compat writes) |
| `agentv2/docs/features.md` | **Feature catalog + feature flags** — 4-category taxonomy, `parrot_feature_flags` schema, status lifecycle |
| `agentv2/docs/status.md` | Implementation status + open questions across all v2 work |
| `agentv2/docs/memory-plan.md` | **Current** memory design (Mastra two-store, config, multi-user scope) |
| `agentv2/tools/remember/remember.md` | What's worth remembering — folds into agent instructions / WM template |
| `agentv2/db/personality/personality.sql` | ⚠️ Superseded — personality lives in v1 `parrot_*` tables. Reference only |

## Language

**All v2 code is TypeScript.** No plain `.js` files. The v1 `agent/` folder stays as-is (JavaScript); v2 is a clean TypeScript rewrite.

## Tech stack

| Layer | Tech |
|-------|------|
| Shell / backend | **NestJS** (long-running Node process; DI, lifecycle, guards) |
| Discord adapter | **Necord** (NestJS + discord.js v14) |
| Cron / jobs | **`@nestjs/schedule`** (replaces v1 `node-cron`) |
| AI core | Mastra (`@mastra/core`, `@mastra/pg`) — framework-free, no Nest/Discord imports |
| TS module mode | `moduleResolution: nodenext` + `module: nodenext` (**required** for Mastra ESM under Nest) |
| LLM models | Mastra Model Router — string-based, no provider packages needed. e.g. `'anthropic/claude-sonnet-4-6'`. Mastra calls provider APIs directly. No `@ai-sdk/*` packages in agentv2. |
| STT | OpenAI Whisper |
| TTS | ElevenLabs |
| Voice | @discordjs/voice, @discordjs/opus, ffmpeg-static |
| Database | Supabase (Postgres + pgvector + RLS) |
| Dashboard | Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui |
| Auth | Supabase SSR + Discord OAuth |
| Testing | Vitest (agent), Playwright E2E (client) |

## Env vars for v2

| Var | Purpose |
|-----|---------|
| `DISCORD_TOKEN` | Discord bot token |
| `DATABASE_URL` | Supabase Postgres **pooler** connection string for Mastra `PgStore`/`PgVector` (Transaction pooler, port 6543, append `?sslmode=require`). **Distinct from `SUPABASE_URL`.** |
| `SUPABASE_URL` | Supabase project URL — for the supabase-js client that reads `parrot_*` tables |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase-js service role (RLS bypass) for reading config + memory writes |
| `ANTHROPIC_API_KEY` | Model Router provider key (if using `anthropic/*` models) |
| `OPENAI_API_KEY` | Model Router provider key; also embeddings (`text-embedding-3-small`) + Whisper STT |
| `ELEVENLABS_API_KEY` | TTS |
| `ELEVENLABS_VOICE_ID` | Optional — default voice if unset |

Note: `DATABASE_URL` (raw Postgres connection for `@mastra/pg`) and `SUPABASE_URL` (REST URL for supabase-js) are two different things — both are needed.

## v1 source map (for porting reference)

| Ability / concern | v1 location |
|-------------------|-------------|
| @mention handling + AI loop | `agent/abilities/mention/` (`handlers.js`, `format.js`) |
| Voice (STT→LLM→TTS pipeline) | `agent/abilities/voice/` (`pipeline.js`, `stt.js`, `tts.js`, `session.js`) |
| Activity triggers + delivery | `agent/activity/` (`listener.js`, `triggers.js`, `deliver.js`, `settings-resolver.js`) |
| Tools | `agent/tools/` (`sing_song.js`, `search_web.js`, `create_timer.js`, `run_roast.js`, `make-joke-like` under `abilities/`) |
| Prompt assembly from `parrot_*` | `agent/config/parrot.js` (`getSystemPromptSections`, `buildSystemPrompt`) |
| Supabase table readers | `agent/database/supabase/` (`parrot-tones.js`, `prompt-sections.js`, `runtime-config.js`, `tool-descriptions.js`, `voice-dimensions.js`) |
| Discord client + intents | `agent/discord-voting-bot.js` |

## Discord gateway intents (from v1, required for parity)

Configured in `NecordModule.forRoot({ intents: [...], partials: [...] })`:
`Guilds`, `GuildMembers`, `GuildPresences`, `GuildMessages`, `MessageContent`, `GuildVoiceStates` — partials `Channel`, `Message`. (`GuildPresences` is required for activity triggers; `GuildVoiceStates` for voice; `MessageContent` for @mentions. See `agent/discord-voting-bot.js:19-29` for the v1 equivalent.)
