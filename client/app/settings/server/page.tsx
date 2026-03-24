"use client";

import { useState } from "react";
import { RotateCcw, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { RequestRestartModal } from "@/components/universal/modals/RequestRestartModal";

export const dynamic = "force-dynamic";

export default function ServerPage() {
  const perms = usePermissions();
  const [restartModalOpen, setRestartModalOpen] = useState(false);

  if (perms.loading) {
    return (
      <div className="p-8 max-w-2xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!perms.authenticated) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Server</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need to log in with Discord to view this page.
        </p>
      </div>
    );
  }

  if (!perms.isAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Server</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins can request a server restart.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" aria-hidden />
            Server
          </CardTitle>
          <CardDescription>
            Request a restart of the Parrott bot. Notifies everyone with the
            overseer role in Discord—either in voice chat or in #parrot. Use
            this after changing config (e.g. personality or model) so the agent
            picks up changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRestartModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-orange-500 to-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:from-orange-400 hover:to-red-400"
              data-testid="request-restart-open"
            >
              <RotateCcw className="size-4 shrink-0" aria-hidden />
              Request restart
            </button>
          </div>
        </CardContent>
      </Card>

      <RequestRestartModal
        open={restartModalOpen}
        onOpenChange={setRestartModalOpen}
      />
    </div>
  );
}
