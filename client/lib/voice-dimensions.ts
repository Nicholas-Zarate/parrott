/**
 * @deprecated Data access moved to Server Actions. Use @/actions/settings/voiceDimensions instead.
 * Client-side fetch/upsert for parrot_voice_dimensions (voice style sliders).
 */

import { createClient } from "@/lib/supabase/client";
import { logDbAudit } from "@/lib/audit-log";

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

/** Values used only when creating a new row via "Create default" in the UI (match migration seed). Not used as display fallback when no row exists. */
export const DEFAULT_DIMENSIONS: Omit<VoiceDimensionsRow, "scope" | "created_at" | "updated_at"> = {
  snarky: 70,
  chill: 30,
  witty: 80,
  sarcastic: 60,
  sassy: 75,
};

function clamp(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Fetch one row by scope. Returns null if not found or error.
 */
export async function fetchVoiceDimensions(
  scope: VoiceScope
): Promise<VoiceDimensionsRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("scope, snarky, chill, witty, sarcastic, sassy, created_at, updated_at")
    .eq("scope", scope)
    .maybeSingle();

  if (error) {
    console.error("[voice-dimensions] fetch error:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    scope: data.scope,
    snarky: clamp(data.snarky),
    chill: clamp(data.chill),
    witty: clamp(data.witty),
    sarcastic: clamp(data.sarcastic),
    sassy: clamp(data.sassy),
    created_at: data.created_at,
    updated_at: data.updated_at,
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
  /** When provided, a db_audit log is written with the diff (old = previousValues, new = values). */
  previousValues?: VoiceDimensionsValues | null;
};

/**
 * Upsert dimensions for a scope. Validates 0-100 and returns error message on failure.
 * When options.previousValues is provided, logs a db_audit entry after success.
 */
export async function saveVoiceDimensions(
  scope: VoiceScope,
  values: VoiceDimensionsValues,
  options?: SaveVoiceDimensionsOptions
): Promise<{ error: string | null }> {
  const payload = {
    scope,
    snarky: clamp(values.snarky),
    chill: clamp(values.chill),
    witty: clamp(values.witty),
    sarcastic: clamp(values.sarcastic),
    sassy: clamp(values.sassy),
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  const { error } = await supabase.from(TABLE).upsert(payload, {
    onConflict: "scope",
  });

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
    logDbAudit({
      table: TABLE,
      operation: "update",
      scopeOrId: `scope=${scope}`,
      changes,
    });
  }
  return { error: null };
}
