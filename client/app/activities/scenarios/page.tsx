"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRIGGER_LABELS } from "@/lib/activity-helpers";
import {
  ACTIVITY_SCENARIOS,
  SCENARIO_ORDER,
  ELI5_STEPS,
} from "@/lib/activity-scenarios";
import { Mic, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function SourceBadge({ source }: { source: "presence" | "voice" }) {
  if (source === "voice") {
    return (
      <Badge
        variant="voice"
        icon={<Mic aria-hidden />}
        title="Triggered by voice state (Go Live)"
      >
        Voice
      </Badge>
    );
  }
  return (
    <Badge
      variant="presence"
      icon={<Radio aria-hidden />}
      title="Triggered by presence (game/stream/status)"
    >
      Presence
    </Badge>
  );
}

export default function ActivityScenariosPage() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-foreground">
        Activity scenarios
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All trigger scenarios that can fire an activity message. Each has a
        cooldown and optional config; when conditions match, the bot may post to
        the activity channel, DM the user, and/or TTS in voice.
      </p>

      {/* Trigger scenarios list */}
      <h2 className="mt-8 text-lg font-semibold text-foreground">
        Trigger scenarios
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These are the scenarios currently defined in the bot. When one fires,
        the message is generated and delivered according to global settings
        (channel, DM, voice TTS).
      </p>
      <ul
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        role="list"
      >
        {SCENARIO_ORDER.map((key) => {
          const scenario = ACTIVITY_SCENARIOS[key];
          if (!scenario) return null;
          const label = TRIGGER_LABELS[key] ?? key;
          return (
            <li key={key} className="min-w-0">
              <Card className="overflow-hidden h-full">
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="trigger" triggerType={key}>
                      {label}
                    </Badge>
                    <SourceBadge source={scenario.source} />
                  </div>
                  <p className="text-sm text-foreground">
                    {scenario.description}
                  </p>
                  {scenario.configSummary ? (
                    <p className="text-xs text-muted-foreground font-mono">
                      {scenario.configSummary}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* ELI5 section (collapsible, default closed) */}
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
