"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_DIMENSIONS,
  fetchVoiceDimensions,
  saveVoiceDimensions,
  type VoiceDimensionsValues,
  type VoiceScope,
} from "@/lib/voice-dimensions";

const SLIDER_LABELS: { key: keyof VoiceDimensionsValues; label: string }[] = [
  { key: "snarky", label: "Snarky" },
  { key: "chill", label: "Chill" },
  { key: "witty", label: "Witty" },
  { key: "sarcastic", label: "Sarcasticness" },
  { key: "sassy", label: "Sassiness" },
];

type Props = {
  scope: VoiceScope;
  title: string;
  description: string;
  canEdit: boolean;
};

export function VoiceStyleSlidersCard({ scope, title, description, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasRow, setHasRow] = useState(false);
  const [values, setValues] = useState<VoiceDimensionsValues>({
    snarky: 0,
    chill: 0,
    witty: 0,
    sarcastic: 0,
    sassy: 0,
  });
  const [savedValues, setSavedValues] = useState<VoiceDimensionsValues | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const row = await fetchVoiceDimensions(scope);
    setLoading(false);
    if (row) {
      const base = {
        snarky: row.snarky,
        chill: row.chill,
        witty: row.witty,
        sarcastic: row.sarcastic,
        sassy: row.sassy,
      };
      setValues(base);
      setSavedValues(base);
      setHasRow(true);
    } else {
      setValues({ snarky: 0, chill: 0, witty: 0, sarcastic: 0, sassy: 0 });
      setSavedValues(null);
      setHasRow(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    savedValues !== null &&
    (values.snarky !== savedValues.snarky ||
      values.chill !== savedValues.chill ||
      values.witty !== savedValues.witty ||
      values.sarcastic !== savedValues.sarcastic ||
      values.sassy !== savedValues.sassy);

  const handleSliderChange = (key: keyof VoiceDimensionsValues, n: number) => {
    const v = Math.max(0, Math.min(100, Math.round(Number(n))));
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const handleSave = async () => {
    if (!dirty || saving || !canEdit) return;
    setSaving(true);
    const { error } = await saveVoiceDimensions(scope, values);
    setSaving(false);
    if (error) {
      toast.error("Failed to save voice style: " + error);
      return;
    }
    setSavedValues(values);
    toast.success("Voice style saved. Changes apply after the agent restarts or next config refresh.");
  };

  const handleDiscard = () => {
    if (savedValues) setValues(savedValues);
  };

  const handleCreateDefault = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    const { error } = await saveVoiceDimensions(scope, DEFAULT_DIMENSIONS);
    setSaving(false);
    if (error) {
      toast.error("Failed to create default: " + error);
      return;
    }
    toast.success("Default voice style created. You can adjust sliders and save.");
    load();
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!hasRow) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          No configuration for this scope. Create a default row to edit voice style sliders (stored in Supabase).
        </p>
        {canEdit && (
          <Button
            size="sm"
            className="mt-3"
            onClick={handleCreateDefault}
            disabled={saving}
          >
            {saving ? "Creating…" : "Create default"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <div className="mt-4 max-w-sm space-y-4">
        {SLIDER_LABELS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <label htmlFor={`${scope}-${key}`} className="text-muted-foreground">
                {label}
              </label>
              <span className="font-mono text-foreground">{values[key]}</span>
            </div>
            <input
              id={`${scope}-${key}`}
              type="range"
              min={0}
              max={100}
              value={values[key]}
              onChange={(e) => handleSliderChange(key, e.target.valueAsNumber)}
              disabled={!canEdit}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDiscard}
            disabled={!dirty}
          >
            Discard
          </Button>
        </div>
      )}

      {!canEdit && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ask an admin for editor permissions to change voice style.
        </p>
      )}
    </div>
  );
}
