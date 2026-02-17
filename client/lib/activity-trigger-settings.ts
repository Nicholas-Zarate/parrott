/**
 * Client-side fetch/upsert for activity_trigger_settings (app defaults: guild_id = null).
 * Used by the Scenarios page to show and edit per-trigger delivery toggles and cooldown.
 */

import { createClient } from "@/lib/supabase/client";
import { SCENARIO_ORDER } from "@/lib/activity-scenarios";
import { logDbAudit } from "@/lib/audit-log";

const TABLE = "activity_trigger_settings";

/** Cooldown (minutes) used only for UI placeholder when a trigger type has no row in DB (fromDb: false). Not used as runtime fallback. */
export const DEFAULT_COOLDOWN_MINUTES: Record<string, number> = {
  game_start: 90,
  late_night: 360,
  long_session: 360,
  group_gaming: 240,
  streaming: 60,
  go_live: 60,
  comeback: 1440,
};

export type ActivityTriggerSettingRow = {
  id: string;
  guild_id: string | null;
  trigger_type: string;
  deliver_channel: boolean;
  deliver_dm: boolean;
  deliver_voice: boolean;
  enabled: boolean;
  cooldown_minutes: number;
  channel_name_override: string | null;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/** Shape used by the UI for one scenario's settings (DB row or defaults). */
export type ScenarioSetting = {
  id: string | null;
  triggerType: string;
  enabled: boolean;
  deliverChannel: boolean;
  deliverDm: boolean;
  deliverVoice: boolean;
  cooldownMinutes: number;
  channelNameOverride: string | null;
  /** When true, this scenario has a row in the DB (app default). When false, we're showing file defaults. */
  fromDb: boolean;
};

function rowToSetting(row: ActivityTriggerSettingRow): ScenarioSetting {
  return {
    id: row.id,
    triggerType: row.trigger_type,
    enabled: row.enabled,
    deliverChannel: row.deliver_channel,
    deliverDm: row.deliver_dm,
    deliverVoice: row.deliver_voice,
    cooldownMinutes: row.cooldown_minutes,
    channelNameOverride: row.channel_name_override ?? null,
    fromDb: true,
  };
}

function defaultSetting(triggerType: string): ScenarioSetting {
  return {
    id: null,
    triggerType,
    enabled: true,
    deliverChannel: true,
    deliverDm: true,
    deliverVoice: true,
    cooldownMinutes: DEFAULT_COOLDOWN_MINUTES[triggerType] ?? 90,
    channelNameOverride: null,
    fromDb: false,
  };
}

/**
 * Fetch app-default rows (guild_id IS NULL) from Supabase and return one ScenarioSetting per trigger type.
 * Rows from DB have fromDb: true. Missing trigger types get a UI-only placeholder (fromDb: false); run migration 029 to seed.
 */
export async function fetchAppDefaultSettings(): Promise<ScenarioSetting[]> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select("*")
    .is("guild_id", null)
    .in("trigger_type", SCENARIO_ORDER);

  if (error) throw new Error(error.message);

  const byType = new Map<string, ScenarioSetting>();
  for (const row of (rows ?? []) as ActivityTriggerSettingRow[]) {
    byType.set(row.trigger_type, rowToSetting(row));
  }
  return SCENARIO_ORDER.map((key) => byType.get(key) ?? defaultSetting(key));
}

/**
 * Update an existing app-default row by id, or insert one (guild_id = null).
 * We use update/insert instead of upsert because Postgres unique treats NULL as distinct.
 */
export async function saveAppDefaultSetting(
  setting: ScenarioSetting,
  patch: {
    enabled?: boolean;
    deliver_channel?: boolean;
    deliver_dm?: boolean;
    deliver_voice?: boolean;
    cooldown_minutes?: number;
    channel_name_override?: string | null;
  }
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const payload = {
    enabled: patch.enabled ?? setting.enabled,
    deliver_channel: patch.deliver_channel ?? setting.deliverChannel,
    deliver_dm: patch.deliver_dm ?? setting.deliverDm,
    deliver_voice: patch.deliver_voice ?? setting.deliverVoice,
    cooldown_minutes: patch.cooldown_minutes ?? setting.cooldownMinutes,
    channel_name_override: patch.channel_name_override ?? setting.channelNameOverride ?? null,
    updated_at: new Date().toISOString(),
  };

  if (setting.id) {
    const { error } = await supabase.from(TABLE).update(payload).eq("id", setting.id);
    if (error) return { error: error.message };
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (patch.enabled !== undefined) changes.enabled = { old: setting.enabled, new: payload.enabled };
    if (patch.deliver_channel !== undefined)
      changes.deliver_channel = { old: setting.deliverChannel, new: payload.deliver_channel };
    if (patch.deliver_dm !== undefined)
      changes.deliver_dm = { old: setting.deliverDm, new: payload.deliver_dm };
    if (patch.deliver_voice !== undefined)
      changes.deliver_voice = { old: setting.deliverVoice, new: payload.deliver_voice };
    if (patch.cooldown_minutes !== undefined)
      changes.cooldown_minutes = { old: setting.cooldownMinutes, new: payload.cooldown_minutes };
    if (patch.channel_name_override !== undefined)
      changes.channel_name_override = {
        old: setting.channelNameOverride,
        new: payload.channel_name_override,
      };
    if (Object.keys(changes).length > 0) {
      logDbAudit({
        table: TABLE,
        operation: "update",
        scopeOrId: `trigger=${setting.triggerType}`,
        changes,
      });
    }
    return { error: null };
  }

  const { error } = await supabase.from(TABLE).insert({
    guild_id: null,
    trigger_type: setting.triggerType,
    ...payload,
  });
  if (error) return { error: error.message };
  logDbAudit({
    table: TABLE,
    operation: "insert",
    scopeOrId: `trigger=${setting.triggerType}`,
    changes: {
      enabled: { old: null, new: payload.enabled },
      deliver_channel: { old: null, new: payload.deliver_channel },
      deliver_dm: { old: null, new: payload.deliver_dm },
      deliver_voice: { old: null, new: payload.deliver_voice },
      cooldown_minutes: { old: null, new: payload.cooldown_minutes },
      channel_name_override: { old: null, new: payload.channel_name_override },
    },
  });
  return { error: null };
}
