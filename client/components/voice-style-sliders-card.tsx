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
  const [values, setValues] = useState<VoiceDimensionsValues>({
    snarky: DEFAULT_DIMENSIONS.snarky,
    chill: DEFAULT_DIMENSIONS.chill,
    witty: DEFAULT_DIMENSIONS.witty,
    sarcastic: DEFAULT_DIMENSIONS.sarcastic,
    sassy: DEFAULT_DIMENSIONS.sassy,
  });
  const [savedValues, setSavedValues] = useState<VoiceDimensionsValues | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const row = await fetchVoiceDimensions(scope);
    setLoading(false);
    const base = row
      ? {
          snarky: row.snarky,
          chill: row.chill,
          witty: row.witty,
          sarcastic: row.sarcastic,
          sassy: row.sassy,
        }
      : { ...DEFAULT_DIMENSIONS };
    setValues(base);
    setSavedValues(base);
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

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <div className="mt-4 space-y-4">
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
