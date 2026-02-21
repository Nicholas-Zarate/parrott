"use client";

import { useState, useEffect } from "react";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/hooks/use-permissions";

const DISMISS_STORAGE_KEY = "parrott_login_prompt_dismissed";

/**
 * Modal shown to unauthenticated users on the home page.
 * Offers "Login with Discord" or "Not now" (dismiss for this session).
 */
export function LoginPromptModal() {
  const { loading, authenticated } = usePermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || authenticated) {
      setOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1") {
        setOpen(false);
        return;
      }
    } catch {
      // sessionStorage unavailable (e.g. private mode)
    }
    setOpen(true);
  }, [loading, authenticated]);

  function handleDismiss() {
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  async function handleLogin() {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error || !data.url) {
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      aria-describedby="login-prompt-desc"
    >
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={handleDismiss}
      />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2
          id="login-prompt-title"
          className="text-lg font-semibold text-foreground"
        >
          See the full dashboard
        </h2>
        <p
          id="login-prompt-desc"
          className="mt-2 text-sm text-muted-foreground"
        >
          Log in with Discord to access History, Logs, Activities, and Settings.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={handleLogin}
            disabled={busy}
            className="gap-2"
          >
            <LogIn className="size-4 shrink-0" aria-hidden />
            Login with Discord
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={busy}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
