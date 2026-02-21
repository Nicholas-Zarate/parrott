"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [discordBusy, setDiscordBusy] = useState(false);

  async function handleDiscordLogin() {
    setDiscordBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error || !data.url) {
      setDiscordBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    setCodeBusy(true);
    try {
      const res = await fetch("/api/console-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setCodeError(
        res.status === 503
          ? (data.error ?? "Console code not configured")
          : (data.error ?? "Invalid code")
      );
    } finally {
      setCodeBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-6 rounded-lg p-18 py-14 lg:p-24 lg:py-18 border border-2 bg-card">
        <div className="flex flex-col items-center pb-8 lg:pb-12">
        <Image
          src="/assets/toucan_white.png"
          alt="Parrott"
          width={100}
          height={100}
          className="shrink-0"
          priority
        />
        <h1 className="font-bold text-black text-3xl font-sans-serif">p a r r o t t</h1>
        {/* <p className="text-muted-foreground text-sm text-center">  What it is, yo</p> */}
        </div>
        {/* <form
          onSubmit={handleCodeSubmit}
          className="flex w-full max-w-xs flex-col gap-2 bg-gray-800 p-4 py-6 rounded-lg"
        >
          <div className="relative">
            <Input
              id="console-code"
              type={showPassword ? "text" : "password"}
              placeholder="speak"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              autoComplete="off"
              disabled={codeBusy}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? "code-error" : undefined}
              className="bg-white text-black pr-9"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((p) => !p)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </Button>
          </div>
          {codeError && (
            <p id="code-error" className="text-sm text-destructive">
              {codeError}
            </p>
          )}
          <Button
            type="submit"
            disabled={codeBusy}
            aria-busy={codeBusy}
            className="w-full gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400 disabled:opacity-70"
          >
            {codeBusy && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
            {codeBusy ? "Checking…" : "Submit"}
          </Button>
        </form> */}

        <Button
          type="button"
          onClick={handleDiscordLogin}
          disabled={discordBusy}
          className="w-full max-w-xs gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4]"
        >
          <DiscordIcon className="size-5 shrink-0" />
          Login with Discord
        </Button>
      </div>
    </div>
  );
}
