"use client";

import { useState, useId } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Megaphone, MessageCircle } from "lucide-react";

const API_REQUEST_RESTART = "/api/request-restart";

export type RequestRestartModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional guild to target; if omitted, backend may use default. */
  guildId?: string | null;
};

/**
 * Shared modal to request a server restart. Sends a request to the API which
 * notifies users with the overseer role—either in voice chat or in #parrot.
 */
export function RequestRestartModal({
  open,
  onOpenChange,
  guildId,
}: RequestRestartModalProps) {
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descId = useId();

  async function handleSend(target: "voice" | "parrot") {
    const payload = { target, guildId: guildId ?? undefined };
    console.log("[RequestRestartModal] Sending request", payload);

    setBusy(true);
    try {
      const res = await fetch(API_REQUEST_RESTART, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[RequestRestartModal] Response", res.status, res.statusText);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[RequestRestartModal] Error response body", data);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      console.log("[RequestRestartModal] Success — request queued; agent will send to Discord when it polls.");
      toast.success(
        target === "voice"
          ? "Restart request sent to voice chat."
          : "Restart request sent to #parrot."
      );
      onOpenChange(false);
    } catch (err) {
      console.error("[RequestRestartModal] Failed to send", err);
      toast.error(err instanceof Error ? err.message : "Failed to send request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          {/* Primary gradient header */}
          <div className="border-b border-transparent bg-gray-800 px-4 py-3">
            <Dialog.Title
              id={titleId}
              className="text-lg font-semibold text-white text-center"
            >
              Request server restart
            </Dialog.Title>
          </div>
          <Dialog.Description
            id={descId}
            className="mt-3 px-4 pb-4 text-sm text-muted-foreground"
          >
            Notifies everyone with the overseer role in Discord. Choose where
            to send the request:
          </Dialog.Description>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <Button
              type="button"
              disabled={busy}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400"
              onClick={() => handleSend("voice")}
            >
              <Megaphone className="size-4 shrink-0" aria-hidden />
              Send to voice chat
            </Button>
            <Button
              type="button"
              disabled={busy}
              variant="outline"
              className="w-full border-orange-500/50 text-foreground hover:bg-orange-500/10 hover:border-orange-500"
              onClick={() => handleSend("parrot")}
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              Send to #parrot channel
            </Button>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" size="sm" className="mt-1">
                Cancel
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
