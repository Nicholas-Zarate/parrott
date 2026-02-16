/**
 * Helpers for logs page: level colors (terminal-style) and message segment parsing
 * for color-coding [bracket] labels.
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-white",
  debug: "text-zinc-500",
};

/**
 * Tailwind class for the given log level (terminal-style colors on charcoal).
 */
export function getLevelColor(level: string): string {
  const normalized = level?.toLowerCase() as LogLevel;
  return LEVEL_COLORS[normalized] ?? "text-zinc-400";
}

export type MessageSegment = { type: "label"; value: string } | { type: "text"; value: string };

/**
 * Split message into segments so [BracketLabel] can be styled separately.
 * Labels are matched as [one or more non-] chars].
 */
export function parseMessageSegments(message: string): MessageSegment[] {
  if (!message) return [];
  const segments: MessageSegment[] = [];
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: message.slice(lastIndex, m.index) });
    }
    segments.push({ type: "label", value: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < message.length) {
    segments.push({ type: "text", value: message.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: "text", value: message }];
}
