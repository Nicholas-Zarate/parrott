"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

const TABLE = "parrot_tones";

export type UpdateToneActiveResult = {
  error: string | null;
  updated_at?: string;
};

export type UpdateToneDescriptionResult = {
  error: string | null;
  updated_at?: string;
};

/**
 * Update a tone's is_active and updated_at. Requires authenticated user; RLS applies.
 */
export async function updateToneActive(
  id: string,
  is_active: boolean
): Promise<UpdateToneActiveResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_active, updated_at })
    .eq("id", id)
    .select("updated_at")
    .maybeSingle();
  if (error) return { error: error.message };
  if (data == null) return { error: "Update had no effect (forbidden or not found)." };
  revalidatePath("/personality");
  return { error: null, updated_at: data.updated_at ?? updated_at };
}

/**
 * Update a tone's description and updated_at. Requires authenticated user; RLS applies.
 */
export async function updateToneDescription(
  id: string,
  description: string | null
): Promise<UpdateToneDescriptionResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ description: description?.trim() || null, updated_at })
    .eq("id", id)
    .select("updated_at")
    .maybeSingle();
  if (error) return { error: error.message };
  if (data == null) return { error: "Update had no effect (forbidden or not found)." };
  revalidatePath("/personality");
  return { error: null, updated_at: data.updated_at ?? updated_at };
}
