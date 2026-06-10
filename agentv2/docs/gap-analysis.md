# Parrott v2 — Second-Pass Gap Analysis

A review of the v2 plan against the **actual v1 behavior** and framework realities, to catch feature-parity holes and integration risks the first-pass plan missed. Each gap notes evidence, recommendation, and which task it folds into.

> Source of truth for the build sequence is still [`../plan.md`](../plan.md); this doc feeds concrete items into those tasks.

Priority: 🔴 high (breaks parity or the dashboard) · 🟡 medium · ⚪ low/note.

---

## 🔴 G1 — Dashboard data contract: `parrot_conversation_history` + `logs`

**Gap:** v2 uses Mastra's own message storage and NestJS's logger. But the dashboard reads two specific v1 tables directly:
- **History page** → `parrot_conversation_history` (`user_text`, `response_text`, `tools_called`, `channel_id`) — `client/app/history/page.tsx:5`.
- **Logs page** → `logs` (`level`, `message`, `meta`) — `client/app/logs/page.tsx:4`.

v1 populates these explicitly (`saveConversation()` in `agent/abilities/mention/handlers.js:214`; logger in `agent/database/supabase/logs.js`). Mastra's message tables have a *different* internal schema — the dashboard cannot read them. **If v2 doesn't write these tables, both dashboard pages go empty.**

**Recommendation:** After each turn, the Discord adapter writes a `parrot_conversation_history` row (port v1's `saveConversation` shape). Add a NestJS logger transport that also writes structured rows to `logs`. These are *dashboard-compat writes*, separate from Mastra's own memory.
**Folds into:** Task 3 (mention) for conversation_history; Task 1/7 for the logger transport.

---

## 🔴 G2 — Channel allowlist, tiers, and rate limiting

**Gap:** v1 only responds in allowlisted channels and rate-limits per user by channel tier (unlimited / semi = 5 per 2 min / limited = 1 per 5 min), with a "resting" countdown message (`isChannelAllowed`, `getChannelTier`, `checkAndRecord` — `handlers.js:52-74`). The v2 plan has none of this — it would respond everywhere, unthrottled.

**Recommendation:** Port the allowlist + tier + rate-limit gate into the Discord adapter (a NestJS guard/interceptor is the idiomatic home). Keep the resting-message UX.
**✅ Decided:** allowlist + tier config lives in a **new dashboard-editable `parrot_*` table** (a real new migration — unlike personality, which reuses existing tables). The dashboard gets a small editor for it later.
**Folds into:** Task 3 (mention), as a pre-run guard.

---

## 🔴 G3 — Per-tool response delivery (text / voice / both)

**Gap:** v1 routes each reply to text and/or voice based on `tools_meta_data.response_delivery` and a set of voice-inherent tools (`handlers.js:170-189`). The dashboard already edits these toggles (the e2e plan covers it). The v2 plan treats tools generically and loses this routing.

**Recommendation:** After the agent run, read which tools were called + their `response_delivery` metadata, and compute `doText`/`doVoice` (port v1's logic). Voice-inherent tools (`join_voice_and_squawk`, `hang_out_in_voice`, `start/stop_listening`) override to voice.
**Folds into:** Task 4 (tools) + Task 5 (voice).

---

## 🔴 G4 — Blocked-role permission gate

**Gap:** v1 rejects messages from members with a blocked Discord role before any LLM/tool call (`hasBlockedRole` — `handlers.js:43-50`, `agent/abilities/restricted-roles.js`). Not in the v2 plan.

**Recommendation:** Port as a NestJS guard on the mention path. Cheap, and a real access-control behavior.
**Folds into:** Task 3 (mention).

---

## 🟡 G5 — Streaming → Discord edit throttling

**Gap:** The v2 plan says "edit Discord reply as tokens arrive." Discord rate-limits message edits (~5 / 5s per channel); editing on every `agent.stream()` token **will** hit it. Note: **v1 does not stream** — it sends a `juan second...` placeholder, awaits the full result, then edits once (`handlers.js:152-188`), sidestepping the problem.

**✅ Decided:** keep v1's **placeholder + single final edit** — send a placeholder, await the complete reply, edit once. Simplest, proven, zero edit-rate-limit risk. (No per-token streaming to Discord; the agent may still produce the full text via stream consumed to completion, but Discord gets one edit.)
**Folds into:** Task 3 (mention).

---

## 🟡 G6 — Error handling & resilience

**Gap:** The plan doesn't cover failure modes. v1 catches LLM errors and shows a friendly message (`getOpenAIErrorMessage`, `handlers.js:224-227`). Also unaddressed: Discord gateway reconnect (Necord/discord.js handle most, but voice sessions need re-establishment), DB pool drops, and Mastra/Model-Router call failures.

**Recommendation:** Define a small error policy — friendly user-facing fallback text on agent failure; rely on discord.js auto-reconnect for the gateway but add a voice-session recovery check; let the pg pool retry. NestJS exception filters are the idiomatic home for the user-facing part.
**Folds into:** Task 3 (baseline) + Task 5 (voice recovery).

---

## 🟡 G7 — Make the boundary rule machine-enforced

**Gap:** The boundary rule ("`core/` imports nothing above it") is documented but nothing enforces it. It will erode the first time someone imports a Discord type into `core/` for convenience.

**Recommendation:** Add an ESLint `no-restricted-imports` (or `dependency-cruiser`) rule that **fails the build** if `core/**` imports `@nestjs/*`, `discord.js`, `necord`, or `@discordjs/*`. Cheap, and turns the principle into a guarantee.
**Folds into:** Task 1 (scaffold) — wire it with the lint setup.

---

## 🟡 G8 — Task 0 spike should validate ALL Mastra tables

**Gap:** Task 0 currently validates the **vector** path against Supabase. But Mastra also auto-creates **thread**, **message**, and **working-memory** tables. The Supabase friction (table auto-create, SSL) could hit any of them, not just vectors.

**Recommendation:** Broaden Task 0 acceptance: confirm a thread is created, a message round-trips, working memory persists across two calls, **and** semantic recall returns — all against Supabase. Record every actual table name + schema Mastra creates.
**Folds into:** Task 0 (expand acceptance).

---

## 🟡 G9 — Testing strategy (beyond "Vitest set up")

**Gap:** "Vitest set up" is named but there's no strategy for *what* to test: agent behavior, adapter translation (Discord event → port), the boundary rule, memory persistence.

**Recommendation:** Define tiers — (1) unit: `formatPersonalityMarkdown`, port translators (plain in/out, no Discord); (2) integration: agent + memory against a test DB; (3) the lint boundary check (G7) as a CI gate. Mastra evals are optional/later. Keep core unit-testable *because* it's framework-free.
**Folds into:** Task 1 (harness) + per-task acceptance.

---

## 🔴 G11 — Activity subsystem parity (reviewed)

**Gap:** Task 6 says "reuse v1's `activity_trigger_settings` resolution" but the activity system is much larger than that. From `agent/activity/listener.js` + `deliver.js`, v2 must preserve:
- **Tracking state** — in-memory `gameStartTimes` + `lastSeen` maps (drive `long_session`, `comeback`, `late_night`), with periodic pruning.
- **Per-user concurrency lock** (`processingUsers` Set) — prevents double-processing rapid presence updates.
- **7 trigger types** — `game_start`, `late_night`, `long_session`, `group_gaming`, `streaming`, `go_live`, `comeback` — each with detection params; **dedup** (late_night supersedes game_start).
- **Cooldown** per (user, triggerType), minutes from resolved settings.
- **DB-backed per-trigger settings** — `activity_trigger_settings` (deliverChannel/Dm/Voice, enabled, cooldown, channelNameOverride), DB→file fallback. Dashboard-editable (scenarios page).
- **3 delivery channels** — activity text channel, **DM (with blocked-role check + per-user `user_dm_preferences` opt-out)**, voice TTS if in VC.
- **Per-trigger AI prompt templates + static fallbacks** (6–9 word reactions) when the LLM is unavailable.
- **Event logging** to `activity_listeners` (`logActivityEvent`) — keep for any dashboard activity view.

**Recommendation:** Treat activity as its own NestJS module (`platforms/discord/activity/`) with a tracking-state service, the resolver (reuse `activity_trigger_settings`), and the deliver service. Reuse `user_dm_preferences` + blocked-role. **Decided:** generate the short reaction with a **direct model call + prompt template + static fallback** (as v1 does) — **not** the full agent/tool/memory loop (avoids latency, tool exposure, and memory pollution from bot-initiated reactions).
**Folds into:** Task 6.

---

## 🔴 G12 — Voice subsystem parity (reviewed)

**Gap:** Task 5 covers STT→agent→TTS + the Opus pipeline, but `agent/abilities/voice/session.js` shows much more:
- **One session per guild** (`sessionsByGuild`) with rich state (connection, player, listening, messageHistory, recentUtterances, expectDirectInputFromUserId).
- **Session persistence** to `voice_sessions` / `voice_session_turns` tables; **auto-end on connection disconnect/destroy** (stateChange handler) — this is the voice half of G6 resilience.
- **Keyword trigger** "parrot(t)" / "sir parrot(t)" + same-utterance remainder; **expect-next-utterance** when only the trigger is said (`expectDirectInputFromUserId`).
- **Single in-flight turn** per session (`processingTurn` guard — see voice-pipeline-findings).
- **Separate voice model** (`voice_model` in runtime config, falls back to text model).
- **Quick-comment job** — `recentUtterances` + `lastQuickCommentAt` drive `voice-quick-comment-job` (bot occasionally comments on VC).
- **Memory mapping decision** — v1 keeps a per-session `messageHistory`. In v2, decide whether voice turns use Mastra memory (`thread = discord:${channelId}`?) or stay session-local.

**Recommendation:** Port session lifecycle + keyword trigger + single-turn guard faithfully (these are subtle and battle-tested). Wire `voice_sessions`/`turns` persistence. Decide voice↔Mastra memory mapping early (Task 5). Keep the quick-comment job (moves to `@nestjs/schedule`/event in Task 6).
**Folds into:** Task 5 (+ quick-comment job in Task 6).

---

## ⚪ G10 — Notes / smaller items

- **Previous-turn context is now automatic.** v1 manually injects the prior turn (`getPreviousTurnForParrot`). Mastra's `lastMessages` handles this — drop the manual logic (simplification, not a gap).
- **Deterministic intent shortcuts.** v1 bypasses the model for "hang out in voice" (`handlers.js:97`). Decide whether v2 keeps hard-coded intent → tool shortcuts or trusts the model. (Task 4/5.)
- **Multi-guild memory bleed.** `resource = discord:${userId}` is global across servers (Discord user IDs are global). Fine for one friend-group server; revisit if the bot joins multiple guilds.
- **Slash commands vs tools.** v1 has Discord slash commands (e.g. roast) *and* agent tools. In v2, decide which user-facing commands are Necord `@SlashCommand`s vs agent tools. (Task 4.)
- **Cron job specifics.** Task 6 ports `node-cron` → `@nestjs/schedule`; the concrete jobs are `announcement-job`, `voice-quick-comment-job`, and (replaced by G-control) `restart-request-consumer`.

---

## Summary — what changed in the plan's risk picture

| # | Gap | Priority | Folds into |
|---|-----|----------|-----------|
| G1 | conversation_history + logs dashboard writes | 🔴 | Task 3, Task 1/7 |
| G2 | channel allowlist + tiers + rate limiting | 🔴 | Task 3 |
| G3 | per-tool response delivery (text/voice/both) | 🔴 | Task 4/5 |
| G4 | blocked-role gate | 🔴 | Task 3 |
| G5 | streaming → **decided: placeholder + single edit** | 🟡 | Task 3 |
| G6 | error handling & resilience | 🟡 | Task 3/5 |
| G7 | enforce boundary rule (lint) | 🟡 | Task 1 |
| G8 | spike validates all Mastra tables | 🟡 | Task 0 |
| G9 | testing strategy | 🟡 | Task 1 |
| G11 | activity subsystem parity (tracking, dedup, DM prefs, delivery, logging) | 🔴 | Task 6 |
| G12 | voice subsystem parity (session lifecycle, keyword trigger, single-turn, quick-comment) | 🔴 | Task 5 |
| G10 | notes (intent shortcuts, slash cmds, multi-guild, cron) | ⚪ | various |

The biggest correction: **v2 isn't just "Mastra replies to mentions."** v1's mention path is a gated pipeline — allowlist → role check → rate limit → run → delivery routing → **dashboard-compat persistence**. The agent swap is the easy part; these gates and the `parrot_conversation_history` / `logs` writes are required for parity and to keep the existing dashboard working.
