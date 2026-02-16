"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ActivityCard, type ActivityRow } from "@/components/activity-card";
import { ActivityLoadingCard } from "@/components/activity-loading-card";
import { Button } from "@/components/ui/button";
import { ACTIVITIES_LOADING_MS } from "@/lib/activity-helpers";

const TABLE = "activity_listeners";
const LIMIT = 100;

type State =
  | { status: "loading" }
  | { status: "success"; data: ActivityRow[] }
  | { status: "error"; error: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchActivitiesFromSupabase(): Promise<{
  data: ActivityRow[] | null;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) return { data: null, error: error.message };
    return { data: (data ?? []) as ActivityRow[], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to load",
    };
  }
}

export function ActivitiesList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    let cancelled = false;
    Promise.all([
      delay(ACTIVITIES_LOADING_MS),
      fetchActivitiesFromSupabase(),
    ]).then(([, result]) => {
      if (cancelled) return;
      if (result.error) {
        setState({ status: "error", error: result.error });
        return;
      }
      setState({ status: "success", data: result.data ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = load();
    return () => {
      if (cancel) cancel();
    };
  }, [load]);

  if (state.status === "loading") {
    return (
      <ul className="flex flex-col gap-2" data-testid="activities-loading">
        <li>
          <ActivityLoadingCard />
        </li>
        <li>
          <ActivityLoadingCard />
        </li>
        <li>
          <ActivityLoadingCard />
        </li>
      </ul>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-4"
        data-testid="activities-error"
      >
        <p className="text-sm font-medium text-destructive">
          Failed to load activities: {state.error}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={load}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (state.data.length === 0) {
    return (
      <p
        className="rounded-xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground"
        data-testid="activities-empty"
      >
        No activities yet. Parrott will log game starts, late-night sessions,
        comebacks, and more here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="activities-list">
      {state.data.map((activity) => (
        <li key={activity.id}>
          <ActivityCard activity={activity} />
        </li>
      ))}
    </ul>
  );
}
