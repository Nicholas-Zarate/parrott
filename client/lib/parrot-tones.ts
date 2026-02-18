/**
 * Client-side update for parrot_tones (tone description).
 * Used by Personality → Tones: edit description in the detail sheet.
 */

import { createClient } from "@/lib/supabase/client";

const TABLE = "parrot_tones";

export type UpdateToneDescriptionResult = {
  error: string | null;
  updated_at?: string;
};

/**
 * Update a tone's description and updated_at. Returns updated_at on success for optimistic UI.
 */
export async function updateToneDescription(
  id: string,
  description: string | null
): Promise<UpdateToneDescriptionResult> {
  const supabase = createClient();
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ description: description?.trim() || null, updated_at })
    .eq("id", id)
    .select("updated_at")
    .maybeSingle();

  if (error) return { error: error.message };
  if (data == null) return { error: "Update had no effect (forbidden or not found)." };
  return { error: null, updated_at: data.updated_at ?? updated_at };
}

export type UpdateToneActiveResult = {
  error: string | null;
  updated_at?: string;
};

/**
 * Update a tone's is_active and updated_at. Used for enable/disable media tones (Text, Voice).
 */
export async function updateToneActive(
  id: string,
  is_active: boolean
): Promise<UpdateToneActiveResult> {
  const supabase = createClient();
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
