"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { logDbAuditServer } from "@/lib/audit-log-server";

const TABLE = "parrot_runtime_config";

export type RuntimeConfig = {
  model: string | null;
  maxCompletionTokens: number | null;
  maxPromptTokens: number | null;
};

export type FetchRuntimeConfigResult =
  | { data: RuntimeConfig; error: null }
  | { data: null; error: string };

export async function fetchRuntimeConfig(): Promise<FetchRuntimeConfigResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select("key, value_text, value_int");
  if (error) return { data: null, error: error.message };
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
  return { data: config, error: null };
}

export type UpdateRuntimeConfigModelOptions = {
  previousModelId?: string | null;
};

export type UpdateRuntimeConfigModelResult = { error: string | null };

export async function updateRuntimeConfigModel(
  modelId: string,
  options?: UpdateRuntimeConfigModelOptions
): Promise<UpdateRuntimeConfigModelResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
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
    await logDbAuditServer(`DB audit: ${TABLE} key=model update | model ${prev}→${trimmed}`, {
      table: TABLE,
      operation: "update",
      scope_or_id: "key=model",
      changes: { model: { old: prev, new: trimmed } },
    });
  }
  revalidatePath("/settings/model");
  return { error: null };
}
