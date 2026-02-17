/**
 * Client-side fetch/update for parrot_runtime_config (model, token limits).
 * Used by the Model settings page. Agent reads this table at startup or when config is refreshed.
 */

import { createClient } from "@/lib/supabase/client";

const TABLE = "parrot_runtime_config";

export type RuntimeConfig = {
  model: string | null;
  maxCompletionTokens: number | null;
  maxPromptTokens: number | null;
};

/**
 * Fetch runtime config from Supabase and return the same shape the agent uses.
 */
export async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("key, value_text, value_int");

  if (error) throw new Error(error.message);

  const config: RuntimeConfig = {
    model: null,
    maxCompletionTokens: null,
    maxPromptTokens: null,
  };

  for (const row of data ?? []) {
    const k = row.key?.trim();
    if (!k) continue;
    if (k === "model" && row.value_text != null)
      config.model = String(row.value_text).trim() || null;
    if (k === "max_completion_tokens" && row.value_int != null)
      config.maxCompletionTokens = Number(row.value_int);
    if (k === "max_prompt_tokens" && row.value_int != null)
      config.maxPromptTokens = Number(row.value_int);
  }

  return config;
}

/**
 * Update the model id in parrot_runtime_config. Caller must be admin (RLS enforces).
 */
export async function updateRuntimeConfigModel(
  modelId: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({
      value_text: modelId.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("key", "model");

  return { error: error?.message ?? null };
}
