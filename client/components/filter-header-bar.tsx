"use client";

import { Button } from "@/components/ui/button";

/**
 * Shared wrapper for filter headers (Logs and History pages).
 * Same layout and styling so both pages look consistent.
 */
export function FilterHeaderBar({
  children,
  onClear,
  showClear,
}: {
  children: React.ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-muted/30 p-4">
      {children}
      {showClear && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
