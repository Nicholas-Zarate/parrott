# Parrott v2 — Feature Catalog & Feature Flags

The canonical list of what the bot does, how each piece is categorized, and how features are gated on/off.

> **Scope of this doc:** the *catalog* (names, categories, implementation) and the *flag schema + lifecycle*. The **live values** (`enabled`/`status`) live in the DB table `parrot_feature_flags`, edited from the dashboard — not here. Build-task state lives in [`status.md`](status.md). Three lenses, no duplication.

---

## Taxonomy — 4 categories

A "feature" is not the same as a "tool." Tools are one category of four.

| Category | What it is | Toggling it means | Is it a tool? |
|----------|-----------|-------------------|---------------|
| **Surface** | How a user *reaches* the bot | Bot listens on this channel at all | No |
| **Tool** | An ability the agent *calls* mid-turn | Agent may/may not use it | Yes — `createTool` |
| **Autonomous** | A bot-*initiated* behavior (no user ask) | Behavior fires or not | No — event/cron driven |
| **Capability** | Cross-cutting infrastructure | Subsystem on/off | Mostly no |

---

## Feature catalog

`flag key` = row in `parrot_feature_flags`. Tool relationship: **is-tool** (a `createTool`) · **uses-tool** · **not-tool**.

### Surfaces

| Feature | flag key | Tool rel. | Implementation | Task |
|---------|----------|-----------|----------------|------|
| Mention Chat | `surface.mention` | not-tool (exposes all tools) | Necord `@On('messageCreate')` → guards → agent → placeholder+single edit | 3 |
| Voice Chat | `surface.voice` | uses-tool (voice tools) | `@discordjs/voice` → Whisper → agent → ElevenLabs | 5 |

### Tools (each a `createTool`; granular flags also in `tools_meta_data.enabled`)

| Feature | flag key | Tool rel. | Implementation | Task |
|---------|----------|-----------|----------------|------|
| Sing | `tool.sing_song` | is-tool | lyrics fetch | 4 |
| Web Search | `tool.search_web` | is-tool | web search API | 4 |
| Timer | `tool.create_timer` | is-tool | countdown → notify | 4 |
| Roast | `tool.run_roast` | is-tool (+ optional slash cmd) | collect msgs → LLM | 4 |
| Joke Like | `tool.make_joke_like` | is-tool | style-mimic LLM | 4 |
| Voice Control | `tool.voice_control` | is-tool ×4 | `join_voice_and_squawk`, `hang_out_in_voice`, `start/stop_listening` | 5 |

### Autonomous (not tools — direct generate + deliver / cron)

| Feature | flag key | Tool rel. | Implementation | Task |
|---------|----------|-----------|----------------|------|
| Activity Reactions | `autonomous.activity` | not-tool | presence/voice-state → 7 triggers → deliver (channel/DM/voice). Granular per-trigger flags in `activity_trigger_settings.enabled` | 6 |
| Announcements | `autonomous.announcements` | not-tool | `@nestjs/schedule` cron → post | 6 |
| Voice Quick-Comment | `autonomous.voice_quick_comment` | not-tool | job on recent VC utterances | 6 |

### Capabilities

| Feature | flag key | Tool rel. | Implementation | Task |
|---------|----------|-----------|----------------|------|
| Memory | `capability.memory` | uses-tool (built-in `updateWorkingMemory`) | `@mastra/pg` working memory + pgvector semantic recall | 2 |
| Personality | `capability.personality` | not-tool | dynamic `parrot_*` → agent instructions | 2 |

---

## Flag schema — `parrot_feature_flags`

A new dashboard-editable table (one row per feature above).

| Column | Type | Purpose |
|--------|------|---------|
| `key` | text PK | e.g. `surface.voice`, `tool.sing_song` |
| `label` | text | UI display name |
| `category` | text | `surface` / `tool` / `autonomous` / `capability` |
| `enabled` | boolean | admin intent (on/off) |
| `status` | text | `planned` / `wip` / `broken` / `live` |
| `description` | text | what it does / why off |
| `updated_at` | timestamptz | last change |

### Activation rule

A feature is **active only if `enabled === true && status === 'live'`.** The bot checks this via `FeatureFlagService.isLive(key)` (cached, like personality) before running any feature. A `broken`/`wip`/`planned` feature never runs even if toggled on — the toggle is intent, `status` is reality.

### Status lifecycle

```
planned ──(task starts)──▶ wip ──(acceptance gate passes)──▶ live
                                                              │
                                            (regression) ◀── broken
```

- `planned` — catalogued, not built.
- `wip` — its build task is in progress.
- `broken` — was live, now failing; set manually so the UI shows a warning and the bot skips it.
- `live` — built, acceptance passed, safe to run.

This lifecycle mirrors the build: every feature task flips its flag `wip → live` on acceptance. The Features page therefore doubles as a live build-progress board.

---

## Two-layer flags

| Layer | Source | Scope |
|-------|--------|-------|
| **Master** | `parrot_feature_flags` | coarse on/off + status per feature (this doc) |
| **Granular** | `tools_meta_data.enabled`, `activity_trigger_settings.enabled` | per-tool, per-trigger (already exist in v1) |

The dashboard **Features** page shows the master list grouped by category, with status badges; expanding **Tools** or **Activity Reactions** drills into the existing granular toggles. Master off ⇒ the whole group is off regardless of granular flags.

---

## Dashboard Features page (client work)

Next.js page (`client/app/features/`), reads/writes `parrot_feature_flags` via Supabase like other config. Grouped list + `enabled` switch + `status` badge per row; drill-down into granular tool/trigger flags. Lower priority than the bot itself — see `plan.md`.
