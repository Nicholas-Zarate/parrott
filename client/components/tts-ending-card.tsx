"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  fetchRuntimeConfig,
  updateRuntimeConfigTtsEnding,
  updateRuntimeConfigTtsEndingProbability,
} from "@/lib/runtime-config";

const DEFAULT_TTS_ENDING_PLACEHOLDER = " SQUACK NINJAS";

type TtsEndingState =
  | { status: "loading" }
  | {
      status: "success";
      ttsEnding: string | null;
      ttsEndingProbability: number | null;
    }
  | { status: "error"; error: string };

type TtsEndingCardProps = {
  /** When false, inputs are disabled and save buttons hidden (e.g. non-admin). */
  canEdit: boolean;
  /** Optional compact layout (e.g. inside a details section). */
  compact?: boolean;
};

export function TtsEndingCard({ canEdit, compact }: TtsEndingCardProps) {
  const [state, setState] = useState<TtsEndingState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [ttsEndingInput, setTtsEndingInput] = useState("");
  const [ttsEndingProbabilityInput, setTtsEndingProbabilityInput] = useState(100);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchRuntimeConfig()
      .then((config) =>
        setState({
          status: "success",
          ttsEnding: config.ttsEnding ?? null,
          ttsEndingProbability: config.ttsEndingProbability ?? null,
        })
      )
      .catch((err) =>
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Failed to load config",
        })
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (state.status === "success") {
      setTtsEndingInput(state.ttsEnding ?? "");
      setTtsEndingProbabilityInput(state.ttsEndingProbability ?? 100);
    }
  }, [state.status, state.ttsEnding, state.ttsEndingProbability]);

  async function handleTtsEndingSave() {
    if (state.status !== "success") return;
    const value = ttsEndingInput;
    setSaving(true);
    const { error } = await updateRuntimeConfigTtsEnding(value);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("TTS ending updated.");
    setState((s) => (s.status === "success" ? { ...s, ttsEnding: value } : s));
  }

  async function handleTtsEndingProbabilitySave() {
    if (state.status !== "success") return;
    const value = Math.max(0, Math.min(100, Math.round(ttsEndingProbabilityInput)));
    setSaving(true);
    const { error } = await updateRuntimeConfigTtsEndingProbability(value);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("TTS ending probability updated.");
    setState((s) => (s.status === "success" ? { ...s, ttsEndingProbability: value } : s));
  }

  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }

  const loading = state.status === "loading";
  const disabled = !canEdit || saving;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              value={ttsEndingInput}
              onChange={(e) => setTtsEndingInput(e.target.value)}
              placeholder={DEFAULT_TTS_ENDING_PLACEHOLDER}
              className="max-w-sm"
              aria-label="TTS response ending"
              disabled={disabled}
            />
            {canEdit && (
              <Button
                onClick={handleTtsEndingSave}
                disabled={saving}
                size="sm"
              >
                Save ending
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="tts-ending-probability"
              className="text-sm text-muted-foreground"
            >
              Trigger probability (%):
            </label>
            <Input
              id="tts-ending-probability"
              type="number"
              min={0}
              max={100}
              value={ttsEndingProbabilityInput}
              onChange={(e) =>
                setTtsEndingProbabilityInput(
                  Math.max(0, Math.min(100, Number(e.target.value) || 0))
                )
              }
              className="w-20"
              aria-label="TTS ending trigger probability"
              disabled={disabled}
            />
            {canEdit && (
              <Button
                onClick={handleTtsEndingProbabilitySave}
                disabled={saving}
                size="sm"
              >
                Save probability
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
