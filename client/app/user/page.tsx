"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getDmPreference, setDmPreference } from "@/actions/user/dmPreferences";

export const dynamic = "force-dynamic";

type Profile = {
  user_id: string;
  discord_id: string | null;
  display_name: string | null;
  username: string | null;
};

type State =
  | { status: "loading" }
  | { status: "auth_required" }
  | { status: "ready"; profile: Profile; allowActivityDm: boolean }
  | { status: "error"; error: string };

export default function UserPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState({ status: "auth_required" });
      return;
    }

    const { data: profileRow } = await supabase
      .from("parrott_user_profiles")
      .select("user_id, discord_id, display_name, username")
      .eq("user_id", user.id)
      .maybeSingle();

    const profile = profileRow as Profile | null;
    if (!profile) {
      setState({
        status: "error",
        error: "Could not load your profile. Make sure you signed in with Discord.",
      });
      return;
    }

    const prefResult = await getDmPreference(user.id);
    if (prefResult.error) {
      setState({ status: "error", error: prefResult.error });
      return;
    }
    setState({
      status: "ready",
      profile,
      allowActivityDm: prefResult.data?.allowActivityDm ?? true,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(checked: boolean) {
    if (state.status !== "ready" || busy) return;
    const { profile } = state;
    const discordId = profile.discord_id?.trim();
    if (!discordId) {
      toast.error("Your Discord ID is missing. Re-login with Discord if needed.");
      return;
    }
    setBusy(true);
    const { error } = await setDmPreference(profile.user_id, discordId, checked);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setState((s) => (s.status === "ready" ? { ...s, allowActivityDm: checked } : s));
    toast.success(checked ? "You’ll receive activity DMs from Parrott." : "Activity DMs are now off.");
  }

  if (state.status === "loading") {
    return (
      <div className="p-8 max-w-2xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (state.status === "auth_required") {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">User</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Log in with Discord to manage your preferences.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">User</h1>
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      </div>
    );
  }

  const { allowActivityDm } = state;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground">User</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your account and how Parrott contacts you.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Activity DMs</CardTitle>
          <CardDescription>
            Parrott can DM you for things like game start, go live, long session, or comeback. Turn
            this off to stop those DMs (you can still use the parrot in channels).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Checkbox
              id="allow-activity-dm"
              checked={allowActivityDm}
              disabled={busy}
              onCheckedChange={(v) => handleToggle(v === true)}
            />
            <Label
              htmlFor="allow-activity-dm"
              className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Receive activity DMs from Parrott
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
