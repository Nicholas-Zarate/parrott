"use client";

import { cn } from "@/lib/utils";
import { TRIGGER_CHIP_CLASSES } from "@/lib/activity-helpers";

const BASE_CLASSES =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

const VARIANT_CLASSES: Record<string, string> = {
  default:
    "border-border bg-muted/50 text-foreground",
  user:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  channel:
    "border-border bg-muted/50 text-foreground",
  dm:
    "border-border bg-muted/50 text-foreground",
  voice:
    "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
  roast:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  presence:
    "border-border bg-muted/50 text-muted-foreground",
  activity:
    "border-border bg-muted/50 text-foreground",
};

export type BadgeVariant =
  | "default"
  | "user"
  | "channel"
  | "dm"
  | "voice"
  | "roast"
  | "presence"
  | "activity"
  | "trigger";

type BadgeProps = {
  variant?: BadgeVariant;
  /** When variant="trigger", the activity trigger type (e.g. game_start, go_live) for consistent colors. */
  triggerType?: string;
  icon?: React.ReactNode;
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function Badge({
  variant = "default",
  triggerType,
  icon,
  title,
  className,
  children,
}: BadgeProps) {
  const variantClass =
    variant === "trigger" && triggerType
      ? TRIGGER_CHIP_CLASSES[triggerType] ?? VARIANT_CLASSES.default
      : VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default;

  return (
    <span
      title={title}
      className={cn(BASE_CLASSES, variantClass, className)}
    >
      {icon ? (
        <span className="mr-1 shrink-0 [&>svg]:size-3" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
