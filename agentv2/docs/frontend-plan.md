# Parrott v2 — Frontend (Dashboard) Plan

Companion to [`../plan.md`](../plan.md). Covers the **`client/` (Next.js dashboard)** changes v2 needs. Build these **after** their brain dependency (see sequencing rule below).

> **Scope:** most of the dashboard is reused untouched. This doc lists only the deltas. **Config stays in Next.js → Supabase** — the bot reads these tables, the dashboard writes them (no bot↔dashboard API for config).

---

## FE work (each gated on a brain task)

| FE task | What | Brain dependency |
|---------|------|------------------|
| **Features page** (`client/app/features/`) | Edit `parrot_feature_flags`: grouped by category (Surface/Tool/Autonomous/Capability), `enabled` switch + `status` badge per row; expand Tools / Activity to drill into existing granular flags (`tools_meta_data.enabled`, `activity_trigger_settings.enabled`) | **Task 2** — flags table + `FeatureFlagService` |
| **Allowlist / tiers editor** | Edit the new channel-allowlist + rate-tier `parrot_*` table (G2): which channels the bot responds in, and each channel's rate tier | **Task 3** — allowlist table created |
| **`request-restart` repoint** (`client/app/api/request-restart/route.ts`) | Call the NestJS control endpoint (`reload`) instead of writing to `restart_requests` for the bot to poll | **Task 7** — control endpoint |
| **Model-picker format** (`client/app/settings/model/`) | Model Router expects provider-prefixed ids (`openai/gpt-4o-mini`). **Preferred: no FE change** — let the bot map bare ids → prefixed (Task 2 mapping layer). Only touch the UI if you want the prefix visible/selectable. | **Task 2** — model mapping layer |

That's **2 new pages, 1 small route change, 1 optional.**

---

## Explicitly NO change (don't re-touch)

These read/write existing tables that v2 keeps populating in the same shape:

- **History** (`client/app/history/page.tsx`) — reads `parrot_conversation_history`; v2 writes the same shape bot-side (gap G1).
- **Logs** (`client/app/logs/page.tsx`) — reads `logs`; v2 logger writes the same shape (G1).
- **Personality** (`client/app/personality/`) — reads/writes `parrot_*`; v2 reuses these tables.
- **Scenarios / Activities** (`client/app/activities/`) — edits `activity_trigger_settings`; v2 reuses.
- **User DM prefs** (`client/app/user/`) — `user_dm_preferences`; v2 reuses.

---

## Reuse existing patterns

- **Server actions:** mirror `client/app/personality/actions.ts` (server action → supabase update with auth/RLS).
- **Supabase server client:** `client/lib/supabase/server.ts` (`createClient()`), `force-dynamic` page pattern.
- **Components:** shadcn primitives already in `client/components/` (switches, filters lists like `prompt-config-lists.tsx`, `logs-with-filters.tsx`).
- **Auth:** Supabase SSR + Discord OAuth already in place — same admin gating as other config pages.

---

## Sequencing rule (brain-before-FE)

FE tasks are **gated on their brain dependency** (table above). The execution order is:

1. Build the brain task → mark it done in `plan.md` / `status.md`.
2. Then build the FE task that depends on it.

This is why FE work lands near the end of the build. Concretely: Features page after Task 2; allowlist editor after Task 3; `request-restart` repoint after Task 7. *(Nothing to mark complete yet — all tasks are still planned.)*

**Status lifecycle tie-in:** the Features page renders `parrot_feature_flags.status` (planned → wip → broken → live), which the brain tasks flip as they progress — so once it exists, the page doubles as a live build-progress board.
