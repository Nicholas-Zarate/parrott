"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_SCENARIOS,
  SCENARIO_ORDER,
  ELI5_STEPS,
} from "@/lib/activity-scenarios";
import {
  fetchAppDefaultSettings,
  type ScenarioSetting,
} from "@/actions/settings/activityTriggerSettings";
import { ScenarioSettingsCard } from "@/components/scenario-settings-card";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SettingsState =
  | { status: "loading" }
  | { status: "success"; settings: ScenarioSetting[] }
  | { status: "error"; error: string };

export default function ActivityScenariosPage() {
  const perms = usePermissions();
  const [state, setState] = useState<SettingsState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await fetchAppDefaultSettings();
    if (result.error) {
      setState({ status: "error", error: result.error });
      return;
    }
    setState({ status: "success", settings: result.data ?? [] });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-foreground">
        Activity scenarios
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Per-scenario delivery toggles and cooldown. When a scenario fires, the
        bot uses these settings (or file defaults if not set) to decide channel,
        DM, and voice TTS.
      </p>

      {state.status === "loading" && (
        <p className="mt-6 text-sm text-muted-foreground">Loading settings…</p>
      )}

      {state.status === "error" && (
        <div className="mt-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-4">
          <p className="text-sm font-medium text-destructive">{state.error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {state.status === "success" && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-foreground">
            Trigger scenarios &amp; delivery
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Toggle delivery (channel, DM, voice) and scenario on/off. Cooldown is
            per user per scenario (minutes).
          </p>

          {!perms.loading && !perms.canEdit && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <Lock className="size-3.5 text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">
                {perms.authenticated
                  ? "You have read-only access. Ask an admin for editor permissions to make changes."
                  : "Log in with Discord to edit settings."}
              </p>
            </div>
          )}

          <ul
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
          >
            {SCENARIO_ORDER.map((key) => {
              const scenario = ACTIVITY_SCENARIOS[key];
              const setting = state.settings.find((s) => s.triggerType === key);
              if (!scenario || !setting) return null;
              return (
                <li key={key} className="min-w-0">
                  <ScenarioSettingsCard
                    setting={setting}
                    scenarioConfig={scenario}
                    onSaved={load}
                    readOnly={!perms.canEdit}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Eli5Section />
    </div>
  );
}

function Eli5Section() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Card className="mt-10 border-primary/20 bg-primary/5">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-t-xl px-6 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-expanded={isOpen}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        >
          <ChevronRight className="size-4" aria-hidden />
        </span>
        <CardTitle className="text-lg">
          How activities work (ELI5)
        </CardTitle>
      </button>
      {isOpen ? (
        <CardContent className="flex flex-col gap-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            A quick rundown of the listener → triggers → cooldown → delivery
            flow.
          </p>
          <ol className="flex flex-col gap-4 list-none">
            {ELI5_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-semibold text-primary"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      ) : null}
    </Card>
  );
}
