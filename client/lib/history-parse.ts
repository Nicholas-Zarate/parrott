/**
 * Parse human-readable channel and user names from user_text.
 * The agent stores context as "User @displayName in #channelName wrote: \"...\"" (see agent/mention/format.js).
 * We don't have Discord API in the client, so this extracts names from the stored string.
 */
export function parseUserContext(userText: string | null): {
  userName: string | null;
  channelName: string | null;
} {
  if (!userText?.trim()) return { userName: null, channelName: null };
  // Match: User @displayName in #channelName wrote: "..."
  const match = userText.match(/User\s+@(.+?)\s+in\s+#(.+?)\s+wrote:\s*"/);
  if (!match) return { userName: null, channelName: null };
  return {
    userName: match[1]?.trim() ?? null,
    channelName: match[2]?.trim() ?? null,
  };
}

export function formatHistoryDate(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}
