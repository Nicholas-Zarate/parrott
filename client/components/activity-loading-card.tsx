"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Skeleton card matching ActivityCard layout for the 3s loading state.
 */
export function ActivityLoadingCard() {
  return (
    <Card className="overflow-hidden gap-0 py-0" data-testid="activity-loading-card">
      <CardHeader className="flex flex-col gap-1.5 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-h-0 flex-shrink-0 flex-row items-center gap-2">
          <span
            className="size-6 shrink-0 rounded bg-muted animate-pulse"
            aria-hidden
          />
          <CardTitle className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-5 w-20 rounded-full bg-muted animate-pulse"
              )}
            />
            <span
              className={cn(
                "inline-block h-5 w-24 rounded-full bg-muted animate-pulse"
              )}
            />
            <span
              className={cn(
                "inline-block h-5 w-14 rounded-full bg-muted animate-pulse"
              )}
            />
          </CardTitle>
        </div>
        <p className="h-4 w-3/4 max-w-sm rounded bg-muted animate-pulse pl-8" />
        <p className="h-3 w-24 rounded bg-muted animate-pulse pl-8" />
      </CardHeader>
    </Card>
  );
}
