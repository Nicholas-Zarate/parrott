/**
 * Client-side fetch/update for parrot_runtime_config (model, token limits).
 * Used by the Model settings page. Agent reads this table at startup or when config is refreshed.
 */

import { createClient } from "@/lib/supabase/client";
import { logDbAudit } from "@/lib/audit-log";

const TABLE = "parrot_runtime_config";

export type RuntimeConfig = {
  model: string | null;
  voiceModel: string | null;
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
    voiceModel: null,
    maxCompletionTokens: null,
    maxPromptTokens: null,
  };

  for (const row of data ?? []) {
    const k = row.key?.trim();
    if (!k) continue;
    if (k === "model" && row.value_text != null)
      config.model = String(row.value_text).trim() || null;
    if (k === "voice_model" && row.value_text != null)
      config.voiceModel = String(row.value_text).trim() || null;
    if (k === "max_completion_tokens" && row.value_int != null)
      config.maxCompletionTokens = Number(row.value_int);
    if (k === "max_prompt_tokens" && row.value_int != null)
      config.maxPromptTokens = Number(row.value_int);
  }

  return config;
}

export type UpdateRuntimeConfigModelOptions = {
  /** When provided, a db_audit log is written with model old→new. */
  previousModelId?: string | null;
};

/**
 * Update the model id in parrot_runtime_config. Caller must be admin (RLS enforces).
 * When options.previousModelId is provided, logs a db_audit entry after success.
 */
export async function updateRuntimeConfigModel(
  modelId: string,
  options?: UpdateRuntimeConfigModelOptions
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const trimmed = modelId.trim();
  const { error } = await supabase
    .from(TABLE)
    .update({
      value_text: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("key", "model");

  if (error) return { error: error.message };
  const prev = options?.previousModelId;
  if (prev !== undefined && prev !== null) {
    logDbAudit({
      table: TABLE,
      operation: "update",
      scopeOrId: "key=model",
      changes: { model: { old: prev, new: trimmed } },
    });
  }
  return { error: null };
}

/**
 * Update the voice_model id in parrot_runtime_config. Caller must be admin (RLS enforces).
 * Requires migration 054 to have run (row must exist).
 */
export async function updateRuntimeConfigVoiceModel(
  modelId: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const trimmed = modelId.trim();
  const { error } = await supabase
    .from(TABLE)
    .update({
      value_text: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("key", "voice_model");

  if (error) return { error: error.message };
  return { error: null };
}
