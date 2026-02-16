# Plan: Per–Trigger-Scenario Delivery & Settings (Supabase)

## 1. How delivery is currently mapped to scenarios

### Short answer: **it isn’t**

Delivery is **global**, not per scenario.

| What | Where | Scope |
|------|--------|--------|
| **Channel** | `config/activity.js` → `channelName` | One channel name for all triggers. Channel post is **always attempted** if the channel exists (no on/off). |
| **DM** | `config/activity.js` → `dmUser` | Single boolean. If `true`, **every** trigger sends a DM. |
| **Voice TTS** | `config/activity.js` → `voiceIfConnected` | Single boolean. If `true`, **every** trigger does voice TTS when the user is in VC. |

In `deliver.js`, the flow is:

1. Generate message (per-trigger: prompt/fallback).
2. **Channel:** always try to send to `activityConfig.channelName` if the channel exists.
3. **DM:** `if (activityConfig.dmUser)` then send.
4. **Voice:** `if (activityConfig.voiceIfConnected && member?.voice?.channel)` then TTS.
5. Log to Supabase.

So **scenario (trigger type) is not used** when deciding channel/DM/voice. Only the global flags are. There is no “game_start uses DM but go_live doesn’t” today.

### Per-trigger config today

In `config/activity.js`, each trigger has only:

- `enabled`
- `cooldownMinutes`
- Optional trigger-specific params: `startHour`, `endHour`, `thresholdMinutes`, `minPlayers`, `absenceMinutes`

No delivery toggles (channel/DM/voice) exist per trigger.

---

## 2. Is the current shape “clean” for a Supabase table?

**Yes, with a small refactor.**

- **Trigger identity** is already a single key: `triggerType` (e.g. `game_start`, `go_live`). That maps cleanly to a row per (guild, trigger_type) or per trigger_type.
- **Delivery decisions** are centralized in `deliver.js` and read from one config object. To support DB-backed settings we only need a **resolution layer**: “for this guild + trigger_type, what are deliver_channel / deliver_dm / deliver_voice?” with a fallback to file defaults (or app defaults).
- **Listener** already passes `triggerType` into `deliver()`, so no change to the “who fires what” logic; only how we **look up** delivery flags and optional overrides (enabled, cooldown, etc.) needs to change.

So: current design is **one config object + one deliver()**. We keep that, and make the config object **buildable from file + Supabase** (with a clear merge/override rule). That’s clean for a table.

---

## 3. Recommended Supabase table: `activity_trigger_settings`

### Scope: per guild, per trigger

- **guild_id** – Discord guild ID. Use `NULL` for **app-wide defaults** (so you can have one row per trigger with `guild_id = NULL` and then override per server).
- **trigger_type** – e.g. `game_start`, `go_live`, `comeback`. Same set as in code.

One row per `(guild_id, trigger_type)` (with `guild_id` nullable for defaults). Unique constraint on `(guild_id, trigger_type)`.

### Proposed columns

| Column | Type | Purpose |
|--------|------|--------|
| `id` | uuid | PK, default `gen_random_uuid()`. |
| `guild_id` | text NULL | Discord guild ID; NULL = app default. |
| `trigger_type` | text NOT NULL | e.g. `game_start`, `go_live`. |
| **Delivery** | | |
| `deliver_channel` | boolean NOT NULL default true | Post to activity channel. |
| `deliver_dm` | boolean NOT NULL default true | DM the user. |
| `deliver_voice` | boolean NOT NULL default true | TTS in VC if user is in a channel. |
| **Trigger control** | | |
| `enabled` | boolean NOT NULL default true | If false, this scenario does not fire at all. |
| `cooldown_minutes` | integer NOT NULL | Per-user cooldown for this trigger (e.g. 90, 60). |
| **Optional overrides** | | |
| `config` | jsonb NULL | Trigger-specific params (e.g. `startHour`, `endHour`, `thresholdMinutes`, `minPlayers`, `absenceMinutes`). Code falls back to file if NULL. |
| **Meta** | | |
| `created_at` | timestamptz | default `now()`. |
| `updated_at` | timestamptz | default `now()`, updated on change. |

So yes: **delivery toggles (channel, DM, voice) per scenario** are the main addition; **enabled** and **cooldown_minutes** in the same table keep “trigger behavior” in one place and allow per-guild overrides later. **config** (jsonb) keeps the table flexible for things like late_night window or long_session threshold without adding columns for every trigger type.

---

## 4. Other settings worth adding (same table or related)

- **Same table**
  - **enabled** – already above.
  - **cooldown_minutes** – already above.
  - **config** (jsonb) – already above; use for startHour, endHour, thresholdMinutes, minPlayers, absenceMinutes, etc.

- **Optional extra column on same table**
  - **channel_name_override** – text NULL. If set, use this channel name for this (guild, trigger) instead of the global `channelName`. Lets a server use e.g. `#go-live-alerts` only for `go_live` and keep the rest in `#parrot-activity`. If you prefer one channel per guild for all triggers, you can instead add a **guild-level** table (e.g. `guild_activity_settings`: guild_id, channel_name) and keep this table only for trigger-level toggles.

- **Separate “global” or “guild” table (optional, later)**
  - **channel_name** – default activity channel name (per guild or app-wide).
  - **dm_user_default**, **voice_if_connected_default** – global defaults when a trigger has no row or no override.

Recommendation: **start with one table** (`activity_trigger_settings`) with the columns above. Add **channel_name_override** only if you need per-trigger channel. Add a guild/default settings table only if you later want guild-level defaults (e.g. “all triggers in this server use #bot-spam”).

---

## 5. Resolution order (how the agent picks settings)

1. **Fetch** (or use cached) row for `(guild_id = this_guild_id, trigger_type)`.
2. If none, **fetch** row for `(guild_id = NULL, trigger_type)` (app default).
3. If still none, **fall back to file** `config/activity.js` (global `dmUser` / `voiceIfConnected` and `triggers[triggerType].enabled` / `cooldownMinutes`).

So: **DB overrides file.** Within DB: **guild row overrides app-default row.**

- **deliver_channel / deliver_dm / deliver_voice** – from resolved row, or from file globals if no row.
- **enabled** – from resolved row, or from `triggers[triggerType].enabled` in file.
- **cooldown_minutes** – from resolved row, or from `triggers[triggerType].cooldownMinutes` in file.
- **config** (startHour, etc.) – from resolved row’s jsonb, or from file.

---

## 6. Implementation phases

### Phase 1: Table + read path (no UI)

- Create migration: `activity_trigger_settings` with columns above.
- Add Supabase helper: e.g. `getActivityTriggerSettings(guildId, triggerType)` → resolved settings (guild row, then app-default row, then file).
- **Optional:** Seed app-default rows (one per trigger_type, guild_id = NULL) so “all delivery on, enabled, cooldown from file” is explicit in DB.
- In **listener**: when checking enabled/cooldown, use resolved settings (DB or file).
- In **deliver**: when deciding channel/DM/voice, use resolved `deliver_channel`, `deliver_dm`, `deliver_voice` (and optional `channel_name_override`) instead of only `activityConfig.dmUser` / `voiceIfConnected` and global channel name.
- Keep **file config** as fallback so existing behavior is unchanged when no rows exist.

### Phase 2: Client UI for delivery toggles

- Scenarios page (or a dedicated “Activity settings” page): for each trigger, show toggles for **Channel / DM / Voice** (and optionally **Enabled** and **Cooldown**).
- API or Supabase client: read/write `activity_trigger_settings` (with RLS so only allowed users/servers can edit).
- If you use app-default only at first, UI can edit rows with `guild_id = NULL`; later add guild selector and edit per-guild rows.

### Phase 3 (optional): Per-guild overrides

- When bot is in multiple servers, allow each server to override: e.g. “In Server A, disable voice for go_live.” Insert/update rows with that server’s `guild_id` and the desired trigger_type and flags.
- Dashboard: “Current server” vs “Default (all servers)” and show/edit the right row.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| How are delivery methods mapped to each scenario today? | They **aren’t**. Channel/DM/Voice are global; all triggers share the same three flags. |
| Is the current setup clean for a DB table? | **Yes.** One resolution layer (DB → file) in one place, keyed by `(guild_id, trigger_type)`, and `deliver()` already receives `triggerType`. |
| What to put in the table? | **deliver_channel**, **deliver_dm**, **deliver_voice**, **enabled**, **cooldown_minutes**, optional **config** (jsonb), optional **channel_name_override**. |
| What else to add? | **enabled** and **cooldown_minutes** in the same table; **config** for trigger-specific params; later, guild-level defaults table if needed. |

Using a single **activity_trigger_settings** table keyed by `(guild_id, trigger_type)` gives you per-scenario control of delivery methods (and enabled/cooldown) in a way that fits the current code and scales to per-guild overrides when you need them.
