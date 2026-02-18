"use server";

import { createClient } from "@/lib/supabase/server";

const TABLE = "parrot_tones";

export type UpdateToneActiveResult = {
  error: string | null;
  updated_at?: string;
};

/**
 * Update a tone's is_active and updated_at. Uses server Supabase client (cookies)
 * so the same session as the page load is used; RLS still applies.
 */
export async function updateToneActiveAction(
  id: string,
  is_active: boolean
): Promise<UpdateToneActiveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "No session in this request. Sign in with Discord and try again (cookies may not be sent to the server).",
    };
  }
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_active, updated_at })
    .eq("id", id)
    .select("updated_at")
    .maybeSingle();

  if (error) return { error: error.message };
  if (data == null) return { error: "Update had no effect (forbidden or not found)." };
  return { error: null, updated_at: data.updated_at ?? updated_at };
}
