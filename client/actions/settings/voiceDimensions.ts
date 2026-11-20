"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { logDbAuditServer } from "@/lib/audit-log-server";

const TABLE = "parrot_voice_dimensions";

export const VOICE_SCOPES = ["global", "tools"] as const;
export type VoiceScope = (typeof VOICE_SCOPES)[number];

export type VoiceDimensionsRow = {
  scope: string;
  snarky: number;
  chill: number;
  witty: number;
  sarcastic: number;
  sassy: number;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_DIMENSIONS = {
  snarky: 70,
  chill: 30,
  witty: 80,
  sarcastic: 60,
  sassy: 75,
} as const;

function clamp(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export type FetchVoiceDimensionsResult =
  | { data: VoiceDimensionsRow | null; error: null }
  | { data: null; error: string };

export async function fetchVoiceDimensions(
  scope: VoiceScope
): Promise<FetchVoiceDimensionsResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("scope, snarky, chill, witty, sarcastic, sassy, created_at, updated_at")
    .eq("scope", scope)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data)
    return {
      data: null,
      error: null,
    };
  return {
    data: {
      scope: data.scope,
      snarky: clamp(data.snarky),
      chill: clamp(data.chill),
      witty: clamp(data.witty),
      sarcastic: clamp(data.sarcastic),
      sassy: clamp(data.sassy),
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
    error: null,
  };
}

export type VoiceDimensionsValues = {
  snarky: number;
  chill: number;
  witty: number;
  sarcastic: number;
  sassy: number;
};

export type SaveVoiceDimensionsOptions = {
  previousValues?: VoiceDimensionsValues | null;
};

export type SaveVoiceDimensionsResult = { error: string | null };

export async function saveVoiceDimensions(
  scope: VoiceScope,
  values: VoiceDimensionsValues,
  options?: SaveVoiceDimensionsOptions
): Promise<SaveVoiceDimensionsResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  const payload = {
    scope,
    snarky: clamp(values.snarky),
    chill: clamp(values.chill),
    witty: clamp(values.witty),
    sarcastic: clamp(values.sarcastic),
    sassy: clamp(values.sassy),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "scope" });
  if (error) return { error: error.message };
  const prev = options?.previousValues;
  if (prev != null) {
    const changes = {
      snarky: { old: prev.snarky, new: payload.snarky },
      chill: { old: prev.chill, new: payload.chill },
      witty: { old: prev.witty, new: payload.witty },
      sarcastic: { old: prev.sarcastic, new: payload.sarcastic },
      sassy: { old: prev.sassy, new: payload.sassy },
    };
    await logDbAuditServer(
      `DB audit: ${TABLE} scope=${scope} update | ${Object.entries(changes)
        .map(([k, v]) => `${k} ${(v as { old: number }).old}→${(v as { new: number }).new}`)
        .join(", ")}`,
      { table: TABLE, operation: "update", scope_or_id: `scope=${scope}`, changes }
    );
  }
  revalidatePath("/personality");
  return { error: null };
}
