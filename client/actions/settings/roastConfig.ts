"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { logDbAuditServer } from "@/lib/audit-log-server";

const TABLE = "parrot_roast_config";

export type RoastConfig = {
  weight_messages: number;
  weight_game_streak: number;
  weight_custom: number;
  game_streak_min_activities: number;
};

const DEFAULT_ROAST_CONFIG: RoastConfig = {
  weight_messages: 60,
  weight_game_streak: 10,
  weight_custom: 30,
  game_streak_min_activities: 5,
};

export type FetchRoastConfigResult =
  | { data: RoastConfig; error: null }
  | { data: null; error: string };

export async function fetchRoastConfig(): Promise<FetchRoastConfigResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select("key, value_int");
  if (error) return { data: null, error: error.message };
  const out: RoastConfig = { ...DEFAULT_ROAST_CONFIG };
  for (const row of data ?? []) {
    const k = row.key?.trim();
    if (!k) continue;
    const v = row.value_int;
    if (k === "roast_weight_messages" && v != null && Number.isFinite(Number(v)))
      out.weight_messages = Math.max(0, Math.min(100, Number(v)));
    if (k === "roast_weight_game_streak" && v != null && Number.isFinite(Number(v)))
      out.weight_game_streak = Math.max(0, Math.min(100, Number(v)));
    if (k === "roast_weight_custom" && v != null && Number.isFinite(Number(v)))
      out.weight_custom = Math.max(0, Math.min(100, Number(v)));
    if (
      k === "roast_game_streak_min_activities" &&
      v != null &&
      Number.isInteger(Number(v)) &&
      Number(v) >= 0
    )
      out.game_streak_min_activities = Number(v);
  }
  return { data: out, error: null };
}

export type UpdateRoastConfigOptions = {
  previousConfig?: Partial<RoastConfig> | null;
};

export type UpdateRoastConfigResult = { error: string | null };

export async function updateRoastConfig(
  config: Partial<RoastConfig>,
  options?: UpdateRoastConfigOptions
): Promise<UpdateRoastConfigResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (config.weight_messages != null) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        value_int: Math.max(0, Math.min(100, config.weight_messages)),
        updated_at: now,
      })
      .eq("key", "roast_weight_messages");
    if (error) return { error: error.message };
  }
  if (config.weight_game_streak != null) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        value_int: Math.max(0, Math.min(100, config.weight_game_streak)),
        updated_at: now,
      })
      .eq("key", "roast_weight_game_streak");
    if (error) return { error: error.message };
  }
  if (config.weight_custom != null) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        value_int: Math.max(0, Math.min(100, config.weight_custom)),
        updated_at: now,
      })
      .eq("key", "roast_weight_custom");
    if (error) return { error: error.message };
  }
  if (config.game_streak_min_activities != null) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        value_int: Math.max(0, Math.floor(Number(config.game_streak_min_activities))),
        updated_at: now,
      })
      .eq("key", "roast_game_streak_min_activities");
    if (error) return { error: error.message };
  }

  const prev = options?.previousConfig;
  if (prev != null && Object.keys(config).length > 0) {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (config.weight_messages != null)
      changes.weight_messages = { old: prev.weight_messages, new: config.weight_messages };
    if (config.weight_game_streak != null)
      changes.weight_game_streak = { old: prev.weight_game_streak, new: config.weight_game_streak };
    if (config.weight_custom != null)
      changes.weight_custom = { old: prev.weight_custom, new: config.weight_custom };
    if (config.game_streak_min_activities != null)
      changes.game_streak_min_activities = {
        old: prev.game_streak_min_activities,
        new: config.game_streak_min_activities,
      };
    if (Object.keys(changes).length > 0) {
      const parts = Object.entries(changes).map(
        ([k, v]) => `${k} ${String((v as { old: unknown }).old)}→${String((v as { new: unknown }).new)}`
      );
      await logDbAuditServer(`DB audit: ${TABLE} roast_config update | ${parts.join(", ")}`, {
        table: TABLE,
        operation: "update",
        scope_or_id: "roast_config",
        changes,
      });
    }
  }

  revalidatePath("/personality");
  return { error: null };
}
