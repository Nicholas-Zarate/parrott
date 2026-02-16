"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MessageSquare, Mail, Mic, Power, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRIGGER_LABELS } from "@/lib/activity-helpers";
import type { ScenarioSetting } from "@/lib/activity-trigger-settings";
import type { ScenarioConfig } from "@/lib/activity-scenarios";
import { saveAppDefaultSetting } from "@/lib/activity-trigger-settings";
import { cn } from "@/lib/utils";

type ScenarioSettingsCardProps = {
  setting: ScenarioSetting;
  scenarioConfig: ScenarioConfig;
  onSaved: () => void;
  readOnly?: boolean;
};

export function ScenarioSettingsCard({
  setting,
  scenarioConfig,
  onSaved,
  readOnly = false,
}: ScenarioSettingsCardProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localCooldown, setLocalCooldown] = useState(String(setting.cooldownMinutes));

  useEffect(() => {
    setLocalCooldown(String(setting.cooldownMinutes));
  }, [setting.cooldownMinutes]);

  const label = TRIGGER_LABELS[setting.triggerType] ?? setting.triggerType;

  async function persist(patch: Parameters<typeof saveAppDefaultSetting>[1]) {
    setError(null);
    setSaving(true);
    const { error: err } = await saveAppDefaultSetting(setting, patch);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    toast.success("Saved");
    onSaved();
  }

  function handleChecked(
    key: "enabled" | "deliver_channel" | "deliver_dm" | "deliver_voice",
    value: boolean
  ) {
    const patch =
      key === "enabled"
        ? { enabled: value }
        : key === "deliver_channel"
          ? { deliver_channel: value }
          : key === "deliver_dm"
            ? { deliver_dm: value }
            : { deliver_voice: value };
    persist(patch);
  }

  function handleCooldownBlur() {
    const n = parseInt(localCooldown, 10);
    if (!Number.isFinite(n) || n < 0) {
      setLocalCooldown(String(setting.cooldownMinutes));
      return;
    }
    const clamped = Math.min(10080, Math.max(0, n)); // 0–7 days
    setLocalCooldown(String(clamped));
    if (clamped !== setting.cooldownMinutes) persist({ cooldown_minutes: clamped });
  }

  return (
    <Card className="overflow-hidden h-full">
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="trigger" triggerType={setting.triggerType}>
            {label}
          </Badge>
          {scenarioConfig.configSummary ? (
            <span className="text-xs text-muted-foreground font-mono">
              {scenarioConfig.configSummary}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-foreground">{scenarioConfig.description}</p>

        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Delivery &amp; behavior</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={setting.enabled}
                onCheckedChange={(v) => handleChecked("enabled", v === true)}
                disabled={saving || readOnly}
                aria-label={`${label}: scenario on/off`}
              />
              <span className="flex items-center gap-1.5 text-sm">
                <Power className="size-3.5 text-muted-foreground" aria-hidden />
                Enabled
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={setting.deliverChannel}
                onCheckedChange={(v) => handleChecked("deliver_channel", v === true)}
                disabled={saving || readOnly}
                aria-label={`${label}: post to channel`}
              />
              <span className="flex items-center gap-1.5 text-sm">
                <MessageSquare className="size-3.5 text-muted-foreground" aria-hidden />
                Channel
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={setting.deliverDm}
                onCheckedChange={(v) => handleChecked("deliver_dm", v === true)}
                disabled={saving || readOnly}
                aria-label={`${label}: DM user`}
              />
              <span className="flex items-center gap-1.5 text-sm">
                <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                DM
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={setting.deliverVoice}
                onCheckedChange={(v) => handleChecked("deliver_voice", v === true)}
                disabled={saving || readOnly}
                aria-label={`${label}: voice TTS`}
              />
              <span className="flex items-center gap-1.5 text-sm">
                <Mic className="size-3.5 text-muted-foreground" aria-hidden />
                Voice
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`cooldown-${setting.triggerType}`} className="flex items-center gap-1.5 text-sm">
              <Timer className="size-3.5 text-muted-foreground" aria-hidden />
              Cooldown (min)
            </Label>
            <Input
              id={`cooldown-${setting.triggerType}`}
              type="number"
              min={0}
              max={10080}
              value={localCooldown}
              onChange={(e) => setLocalCooldown(e.target.value)}
              onBlur={handleCooldownBlur}
              disabled={saving || readOnly}
              className={cn("w-20 font-mono")}
              aria-label={`${label}: cooldown minutes`}
            />
          </div>
        </div>

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {saving ? (
          <p className="text-xs text-muted-foreground">Saving…</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
