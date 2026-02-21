"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Cpu } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  fetchRuntimeConfig,
  updateRuntimeConfigModel,
  updateRuntimeConfigVoiceModel,
} from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** Allowed model ids for the dropdown. Add new models here when needed. */
const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "gpt-4o", label: "OpenAI: gpt-4o" },
  { value: "gpt-4o-mini", label: "OpenAI: gpt-4o-mini" },
  { value: "claude-sonnet-4-5", label: "Anthropic: Claude Sonnet 4.5" },
  { value: "grok-3", label: "xAI: Grok 3" },
  { value: "grok-3-mini", label: "xAI: Grok 3 Mini" },
  { value: "grok-4-0709", label: "xAI: Grok 4" },
  { value: "grok-4-1-fast-reasoning", label: "xAI: Grok 4.1 Fast (reasoning)" },
];

type ModelState =
  | { status: "loading" }
  | { status: "success"; model: string | null; voiceModel: string | null }
  | { status: "error"; error: string };

export default function ModelPage() {
  const perms = usePermissions();
  const [state, setState] = useState<ModelState>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchRuntimeConfig()
      .then((config) =>
        setState({
          status: "success",
          model: config.model ?? null,
          voiceModel: config.voiceModel ?? null,
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
    if (!perms.loading) load();
  }, [perms.loading, load]);

  async function handleModelChange(value: string) {
    const previousModel =
      state.status === "success" ? (state.model ?? undefined) : undefined;
    setSaving(true);
    const { error } = await updateRuntimeConfigModel(value, {
      previousModelId: previousModel,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Model updated.");
    setState((s) => (s.status === "success" ? { ...s, model: value } : s));
  }

  async function handleVoiceModelChange(value: string) {
    setSaving(true);
    const { error } = await updateRuntimeConfigVoiceModel(value);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Voice model updated.");
    setState((s) => (s.status === "success" ? { ...s, voiceModel: value } : s));
  }

  if (perms.loading) {
    return (
      <div className="p-8 max-w-2xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!perms.authenticated) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Model</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need to log in with Discord to view this page.
        </p>
      </div>
    );
  }

  if (!perms.isAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Model</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins can change the model.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Model</h1>
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      </div>
    );
  }

  const currentModel = state.status === "success" ? state.model : null;
  const currentVoiceModel = state.status === "success" ? state.voiceModel : null;
  const inList = currentModel && MODEL_OPTIONS.some((o) => o.value === currentModel);
  const displayValue = currentModel ?? "";
  const voiceInList = currentVoiceModel && MODEL_OPTIONS.some((o) => o.value === currentVoiceModel);
  const displayVoiceValue = currentVoiceModel ?? "";
  const options = [...MODEL_OPTIONS];
  if (currentModel && !inList) {
    options.push({ value: currentModel, label: `Current: ${currentModel}` });
  }
  const voiceOptions = [...MODEL_OPTIONS];
  if (currentVoiceModel && !voiceInList) {
    voiceOptions.push({ value: currentVoiceModel, label: `Current: ${currentVoiceModel}` });
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-5" aria-hidden />
            Model
          </CardTitle>
          <CardDescription>
            Choose the LLM for parrot chat, activity messages, roasts, and
            announcements. Changes apply after the bot restarts or reloads
            config.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <Select
              value={displayValue}
              onValueChange={handleModelChange}
              disabled={saving}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-5" aria-hidden />
            Voice model
          </CardTitle>
          <CardDescription>
            Model used for voice chat (e.g. &ldquo;hey parrot&rdquo;). Use a
            faster model for lower latency. Falls back to the main model above
            if not set. Changes apply after the bot restarts or reloads config.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <Select
              value={displayVoiceValue}
              onValueChange={handleVoiceModelChange}
              disabled={saving}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select voice model" />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
