"use client";

import { useState } from "react";
import { LogIn, LogOut, Terminal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/lib/auth-context";

/**
 * Sidebar / nav auth widget.
 * Uses the generic app user (Discord and/or console). Shows "Login with Discord"
 * when not authenticated; otherwise shows Discord avatar/name or "Console user".
 */
export function AuthUser({ collapsed }: { collapsed?: boolean }) {
  const { user, loading } = useAppUser();

  if (loading) return null;

  const hasDiscord = user?.discord && (user.discord.id ?? user.discord.preferred_username);
  const hasConsole = user?.consoleUser === true;

  if (!hasDiscord && !hasConsole) {
    return <LoginButton collapsed={collapsed} />;
  }

  const name = hasDiscord
    ? (user!.discord!.full_name ||
        user!.discord!.name ||
        user!.discord!.preferred_username ||
        "User")
    : "Console user";
  const avatarUrl = user?.discord?.avatar_url ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={
          collapsed
            ? "flex justify-center"
            : "flex items-center gap-2 px-2 min-w-0"
        }
        title={name}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-6 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-accent-foreground">
            {hasDiscord ? name.charAt(0).toUpperCase() : <Terminal className="size-3" aria-hidden />}
          </span>
        )}
        {!collapsed && (
          <span className="truncate text-xs font-medium text-sidebar-foreground">
            {name}
          </span>
        )}
      </div>
      <LogoutButton collapsed={collapsed} />
    </div>
  );
}

function LoginButton({ collapsed }: { collapsed?: boolean }) {
  const [busy, setBusy] = useState(false);

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

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogin}
      disabled={busy}
      title="Login with Discord"
      className={
        collapsed
          ? "h-8 w-full justify-center px-2 text-muted-foreground hover:text-foreground"
          : "h-8 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-foreground"
      }
    >
      <LogIn className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="text-xs">Login with Discord</span>}
    </Button>
  );
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={busy}
      title="Logout"
      className={
        collapsed
          ? "h-8 w-full justify-center px-2 text-muted-foreground hover:text-foreground"
          : "h-8 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-foreground"
      }
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="text-xs">Logout</span>}
    </Button>
  );
}
