/**
 * Client-side fetch/update for parrot_roast_config (roast type weights and game streak min).
 * Used by the Personality page Roast tab. Agent reads this table at startup when refreshPromptConfig runs.
 */

import { createClient } from "@/lib/supabase/client";

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

/**
 * Fetch roast config from Supabase. Returns defaults when table is empty or missing.
 */
export async function fetchRoastConfig(): Promise<RoastConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("key, value_int");

  if (error) throw new Error(error.message);

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
    if (k === "roast_game_streak_min_activities" && v != null && Number.isInteger(Number(v)) && Number(v) >= 0)
      out.game_streak_min_activities = Number(v);
  }
  return out;
}

/**
 * Update roast config in Supabase. Caller must be admin (RLS enforces).
 * Weights are not auto-normalized; UI should ensure they sum to 100.
 */
export async function updateRoastConfig(
  config: Partial<RoastConfig>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const updates: Promise<{ error: string | null }>[] = [];

  if (config.weight_messages != null) {
    updates.push(
      supabase
        .from(TABLE)
        .update({ value_int: Math.max(0, Math.min(100, config.weight_messages)), updated_at: now })
        .eq("key", "roast_weight_messages")
        .then((r) => ({ error: r.error?.message ?? null }))
    );
  }
  if (config.weight_game_streak != null) {
    updates.push(
      supabase
        .from(TABLE)
        .update({ value_int: Math.max(0, Math.min(100, config.weight_game_streak)), updated_at: now })
        .eq("key", "roast_weight_game_streak")
        .then((r) => ({ error: r.error?.message ?? null }))
    );
  }
  if (config.weight_custom != null) {
    updates.push(
      supabase
        .from(TABLE)
        .update({ value_int: Math.max(0, Math.min(100, config.weight_custom)), updated_at: now })
        .eq("key", "roast_weight_custom")
        .then((r) => ({ error: r.error?.message ?? null }))
    );
  }
  if (config.game_streak_min_activities != null) {
    updates.push(
      supabase
        .from(TABLE)
        .update({
          value_int: Math.max(0, Math.floor(Number(config.game_streak_min_activities))),
          updated_at: now,
        })
        .eq("key", "roast_game_streak_min_activities")
        .then((r) => ({ error: r.error?.message ?? null }))
    );
  }

  if (updates.length === 0) return { error: null };
  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  return { error: firstError?.error ?? null };
}
