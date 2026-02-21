"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export type ErrorNotificationToastOptions = {
  description?: string;
  duration?: number;
};

/**
 * Show an error toast using the app's error toast styling (destructive icon).
 * Use this for consistent error notifications (e.g. API failures, validation).
 */
export function showErrorNotification(
  message: string,
  options?: ErrorNotificationToastOptions
): void {
  toast.error(message, {
    description: options?.description,
    duration: options?.duration ?? 5000,
  });
}

type ErrorNotificationProps = {
  message: string;
  description?: string;
  className?: string;
};

/**
 * Inline error message box (non-toast). Use for form-level or section-level
 * error display alongside or instead of toasts.
 */
export function ErrorNotification({
  message,
  description,
  className,
}: ErrorNotificationProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive",
        className
      )}
    >
      <AlertCircle className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{message}</p>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
