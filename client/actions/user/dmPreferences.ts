"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

export type DmPreference = {
  allowActivityDm: boolean;
};

export type GetDmPreferenceResult =
  | { data: DmPreference; error: null }
  | { data: null; error: string };

export async function getDmPreference(userId: string): Promise<GetDmPreferenceResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_dm_preferences")
    .select("allow_activity_dm")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return {
    data: data ? { allowActivityDm: data.allow_activity_dm === true } : { allowActivityDm: true },
    error: null,
  };
}

export type SetDmPreferenceResult = { error: string | null };

export async function setDmPreference(
  userId: string,
  discordId: string,
  allowActivityDm: boolean
): Promise<SetDmPreferenceResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from("user_dm_preferences").upsert(
    {
      user_id: userId,
      discord_id: discordId,
      allow_activity_dm: allowActivityDm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  revalidatePath("/user");
  return { error: error?.message ?? null };
}
