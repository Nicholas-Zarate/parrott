/**
 * @deprecated Data access moved to Server Actions. Use @/actions/user/dmPreferences instead.
 * Client-side fetch/update for user_dm_preferences (opt-in/out of activity DMs).
 */

import { createClient } from "@/lib/supabase/client";

export type DmPreference = {
  allowActivityDm: boolean;
};

/**
 * Get current user's DM preference. Returns default { allowActivityDm: true } if no row.
 */
export async function getDmPreference(
  userId: string
): Promise<{ data: DmPreference | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_dm_preferences")
    .select("allow_activity_dm")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { data: null, error };
  return {
    data: data
      ? { allowActivityDm: data.allow_activity_dm === true }
      : { allowActivityDm: true },
    error: null,
  };
}

/**
 * Upsert current user's DM preference. Requires discordId from profile (Discord login).
 */
export async function setDmPreference(
  userId: string,
  discordId: string,
  allowActivityDm: boolean
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("user_dm_preferences").upsert(
    {
      user_id: userId,
      discord_id: discordId,
      allow_activity_dm: allowActivityDm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  return { error: error ?? null };
}
