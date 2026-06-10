# Parrott v2 — Architecture

How the v2 bot is structured, how the layers connect, and the one integration gotcha to get right up front.

---

## Ports & adapters: NestJS shell, Mastra core

The brain is **Mastra**. Discord is a capability it *uses*, not what it *is*. NestJS is the application shell around both.

```
   ┌─────────────────────────────────────────────┐
   │  NestJS shell  (DI · lifecycle · cron · HTTP) │
   │   ┌─────────────────────────────────────────┐ │
   │   │  platforms/discord  (Necord + voice)     │ │
   │   │   ┌─────────────────────────────────────┐ │ │
   │   │   │  core  (Mastra — framework-free)    │ │ │
   │   │   └─────────────────────────────────────┘ │ │
   │   └─────────────────────────────────────────┘ │
   └─────────────────────────────────────────────┘

   Dependencies point INWARD only:
   NestJS → platforms → core.   core imports NOTHING above it.
```

| Layer | Tech | Responsibility |
|-------|------|----------------|
| **Shell** | NestJS | DI, lifecycle (startup/graceful shutdown), cron (`@nestjs/schedule`), the HTTP control edge, security/guards |
| **Adapter** | discord.js via Necord (+ `@discordjs/voice`) | Translate Discord events → core calls; route core output → Discord |
| **Core** | Mastra | The brain: agent, tools, memory, personality formatting. Portable, framework-free |

### Boundary rule (canonical)

> **Core depends on Mastra only.** discord.js/Necord is confined to `platforms/discord/`. NestJS is confined to the shell (modules/providers/controllers). Core types are plain (text, audio, scope ids) — no Discord or Nest objects cross into `core/`. The core defines **ports** (interfaces); adapters implement them.

### Ports (defined in `core/ports/`)

- `IncomingMessage` — plain `{ text, userId, channelId, ... }` (no Discord `Message` object)
- `Replier` — text output sink (the Discord adapter implements it to send/edit a reply)
- `VoiceSink` — audio output sink (the voice adapter implements it to play TTS)

This is what makes the core portable: a future Slack adapter implements the same ports; `core/` never changes.

---

## ⚠️ The one load-bearing gotcha: ESM vs CommonJS

**Mastra is ESM-first; NestJS defaults to CommonJS.** Importing `@mastra/core/agent` under CommonJS fails:

```
Cannot find module '@mastra/core/agent' or its corresponding type declarations.
Consider updating to 'node16', 'nodenext', or 'bundler'.
```

Source: [mastra#3301](https://github.com/mastra-ai/mastra/issues/3301).

**Fix — set in the agentv2 NestJS `tsconfig.json` from the scaffold:**

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
    // ...
  }
}
```

If this isn't in place, **every `@mastra/core/*` import breaks.** Proving a real `import { Agent } from '@mastra/core/agent'` compiles and runs under Nest is an explicit acceptance gate in `plan.md` Task 1.

**Secondary (low-risk):** Mastra-in-DI has had beta rough edges ([#5880](https://github.com/mastra-ai/mastra/issues/5880), [#5081](https://github.com/mastra-ai/mastra/issues/5081)). Mitigate by instantiating the Mastra agent inside a **NestJS provider** (singleton factory) rather than scattering `new Agent()` calls.

---

## Connection map

Most links are *not* HTTP. Here's every external connection the bot holds:

| Link | Transport | Owner | Notes |
|------|-----------|-------|-------|
| Bot ↔ Discord gateway | **WebSocket** (WSS) | Necord / discord.js | always-open; events via `@On`/`@Once` |
| Bot → Discord REST | **HTTPS** | discord.js | send/edit messages |
| Voice audio | **UDP** | `@discordjs/voice` | runs alongside Necord, uses the same client |
| Core → memory DB | **TCP** Postgres + SSL | `@mastra/pg` | `DATABASE_URL` pooler (port 6543, `?sslmode=require`) |
| Infra → config DB | **HTTPS** REST | supabase-js | reads `parrot_*` tables |
| Next.js → control edge | **HTTPS** (guarded) | NestJS controller | optional; replaces v1 `restart_requests` poll |
| Next.js → Supabase | HTTPS / SSR | unchanged | config writes + Discord OAuth auth |
| Shared store | — | Supabase Postgres | both bot and dashboard read/write here |

### Will it all connect smoothly?

Yes, with standard transports — the only non-standard hazard is the ESM/CJS tsconfig issue above.

- **Necord + `@discordjs/voice`** coexist: the voice pipeline uses the same client Necord manages.
- **FE ↔ BE coupling is minimal.** The dashboard (Next.js) and the bot (NestJS) **never call each other for config** — they share the Supabase database like a notebook. The bot reads `parrot_*`; the dashboard writes them.
- The **only** direct FE→BE call is the optional **control endpoint** (reload/state/trigger), guarded by a shared secret or Supabase JWT. It replaces v1's restart-by-DB-polling hack.
- **Graceful shutdown:** Nest `enableShutdownHooks()` + `OnModuleDestroy` tears down the Discord connection, ends voice sessions, and closes the pg pool cleanly.

---

## Where config and control live (decided)

- **Config editing** (personality, keywords) **stays in Next.js → Supabase.** NestJS does not own config CRUD — that would duplicate working code and re-implement Supabase-session auth. The bot reads config dynamically per-turn (30–60s cache).
- **Control** (reload cache now / live state / trigger) lives on the **NestJS control endpoint** — the one piece that genuinely benefits from a bot-side API.

See [`memory-plan.md`](memory-plan.md) for the memory design and [`../plan.md`](../plan.md) for the build sequence.
