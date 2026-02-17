"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchRoastConfig,
  updateRoastConfig,
  type RoastConfig,
} from "@/lib/roast-config";

type Props = {
  canEdit: boolean;
};

export function RoastConfigCard({ canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<RoastConfig>({
    weight_messages: 60,
    weight_game_streak: 10,
    weight_custom: 30,
    game_streak_min_activities: 5,
  });
  const [savedConfig, setSavedConfig] = useState<RoastConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRoastConfig();
      setConfig(data);
      setSavedConfig(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load roast config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sum = config.weight_messages + config.weight_game_streak + config.weight_custom;
  const dirty =
    savedConfig !== null &&
    (config.weight_messages !== savedConfig.weight_messages ||
      config.weight_game_streak !== savedConfig.weight_game_streak ||
      config.weight_custom !== savedConfig.weight_custom ||
      config.game_streak_min_activities !== savedConfig.game_streak_min_activities);

  const handleSave = async () => {
    if (!canEdit || !dirty) return;
    setSaving(true);
    const { error } = await updateRoastConfig(config, {
      previousConfig: savedConfig ?? undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Roast config saved.");
    setSavedConfig({ ...config });
  };

  const normalizeTo100 = () => {
    const s = config.weight_messages + config.weight_game_streak + config.weight_custom;
    if (s <= 0) return;
    setConfig({
      ...config,
      weight_messages: Math.round((config.weight_messages / s) * 100),
      weight_game_streak: Math.round((config.weight_game_streak / s) * 100),
      weight_custom: Math.round((config.weight_custom / s) * 100),
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roast type weights</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roast type weights</CardTitle>
        <CardDescription>
          Percent chance for each roast type when someone is roasted (slash command or @mention).
          Weights should sum to 100. Game streak roast only runs when the user has at least the
          minimum number of activities (e.g. games they’re playing).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="roast-weight-messages">Message context (%)</Label>
            <Input
              id="roast-weight-messages"
              type="number"
              min={0}
              max={100}
              value={config.weight_messages}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  weight_messages: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roast-weight-game-streak">Game streak (%)</Label>
            <Input
              id="roast-weight-game-streak"
              type="number"
              min={0}
              max={100}
              value={config.weight_game_streak}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  weight_game_streak: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roast-weight-custom">Custom / no context (%)</Label>
            <Input
              id="roast-weight-custom"
              type="number"
              min={0}
              max={100}
              value={config.weight_custom}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  weight_custom: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
              disabled={!canEdit}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Sum: {sum} {sum !== 100 && "(should be 100)"}
        </p>
        {sum !== 100 && canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={normalizeTo100}>
            Normalize to 100
          </Button>
        )}
        <div className="space-y-2">
          <Label htmlFor="roast-min-activities">Min activities for game streak roast</Label>
          <Input
            id="roast-min-activities"
            type="number"
            min={0}
            value={config.game_streak_min_activities}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                game_streak_min_activities: Math.max(
                  0,
                  Math.floor(Number(e.target.value) || 0)
                ),
              }))
            }
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">
            Game streak roast is only eligible when the user has at least this many current
            activities (e.g. &quot;Playing X&quot;, &quot;Listening to Y&quot;). Default 5.
          </p>
        </div>
        {canEdit && dirty && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save roast config"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
