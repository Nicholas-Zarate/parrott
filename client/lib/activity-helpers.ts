/**
 * Helpers for the Activities UI: trigger labels/colors, relative time, activity type labels.
 */

export const TRIGGER_LABELS: Record<string, string> = {
  game_start: "Game start",
  late_night: "Late night",
  long_session: "Long session",
  group_gaming: "Group gaming",
  streaming: "Streaming",
  go_live: "Go live",
  comeback: "Comeback",
} as const;

export const TRIGGER_CHIP_CLASSES: Record<string, string> = {
  game_start:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200",
  late_night:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  long_session:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  group_gaming:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  streaming:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  go_live:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  comeback:
    "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200",
};

export const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  0: "Playing",
  1: "Streaming",
  2: "Listening",
  3: "Watching",
  4: "Custom",
  5: "Competing",
};

const LOADING_MS = 800;
export const ACTIVITIES_LOADING_MS = LOADING_MS;

/**
 * Format a timestamp as relative time (e.g. "2h ago", "Just now") with exact time for title.
 */
export function formatRelativeTime(iso: string): { relative: string; exact: string } {
  const date = new Date(iso);
  const now = new Date();
  const exact = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffH / 24);

  if (diffSec < 60) return { relative: "Just now", exact };
  if (diffMin < 60) return { relative: `${diffMin}m ago`, exact };
  if (diffH < 24) return { relative: `${diffH}h ago`, exact };
  if (diffDay === 1) return { relative: "Yesterday", exact };
  if (diffDay < 7) return { relative: `${diffDay}d ago`, exact };
  return { relative: exact, exact };
}

/**
 * Format message for one-line preview (first ~50 chars).
 */
export function messagePreview(message: string | null | undefined, maxLen = 50): string | null {
  const raw = (message ?? "").trim();
  if (!raw) return null;
  const slice = raw.slice(0, maxLen).replace(/\n/g, " ");
  return slice + (raw.length > maxLen ? "…" : "");
}

/**
 * Format context JSON for display (single line or short block).
 */
export function formatContext(context: unknown): string {
  if (context == null) return "—";
  if (typeof context !== "object") return String(context);
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

type TriggerExplanationInput = {
  trigger_type: string;
  activity_name: string | null;
  user_name: string | null;
  context: unknown;
};

/**
 * Plain-language explanation of why this activity was triggered (for "Why was this triggered?" section).
 */
export function getTriggerExplanation(input: TriggerExplanationInput): string {
  const { trigger_type, activity_name, user_name, context } = input;
  const who = user_name ?? "A user";
  const ctx = context && typeof context === "object" ? (context as Record<string, unknown>) : {};

  switch (trigger_type) {
    case "game_start":
      return `${who} started playing "${activity_name ?? ctx.game ?? "a game"}".`;
    case "late_night":
      return `${who} started playing "${activity_name ?? ctx.game ?? "a game"}" during late-night hours (${ctx.hour != null ? `${ctx.hour}:00 UTC` : "0–5 UTC"}).`;
    case "long_session":
      return `${who} has been playing "${activity_name ?? ctx.game ?? "a game"}" for ${ctx.hoursPlayed ?? "several"} hours straight.`;
    case "group_gaming":
      return `${who} started playing "${activity_name ?? ctx.game ?? "a game"}" and ${ctx.playerCount ?? "enough"} people in the server are now playing it together.`;
    case "streaming":
      return `${who} went live streaming "${activity_name ?? ctx.stream ?? "content"}".`;
    case "go_live":
      return `${who} went live (screen share) in the voice channel "${ctx.channelName ?? activity_name ?? "voice"}".`;
    case "comeback":
      return `${who} came back online after being away for ${ctx.hoursAway ?? "many"} hours.`;
    default:
      return `This was triggered by a ${trigger_type} event.`;
  }
}
