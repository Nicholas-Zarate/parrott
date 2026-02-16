"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

/**
 * Sidebar / nav auth widget.
 * Shows "Login with Discord" when logged out.
 * Shows Discord avatar + name + logout when logged in.
 */
export function AuthUser({ collapsed }: { collapsed?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  if (!user) {
    return <LoginButton collapsed={collapsed} />;
  }

  const meta = user.user_metadata ?? {};
  const name: string =
    meta.full_name || meta.name || meta.preferred_username || "User";
  const avatarUrl: string | null = meta.avatar_url ?? null;

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
            {name.charAt(0).toUpperCase()}
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
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
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
