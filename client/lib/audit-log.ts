/**
 * Client-side DB audit logging. Sends a readable message and meta to the logs table
 * via the API route (so the server can attach user from session and respect RLS).
 * Fire-and-forget: we do not block the caller on the audit write.
 */

const AUDIT_API = "/api/audit-log";

export type DbAuditChanges = Record<
  string,
  { old: unknown; new: unknown } | { old: unknown; new: unknown }[]
>;

export type LogDbAuditParams = {
  table: string;
  operation: "insert" | "update";
  scopeOrId?: string;
  changes: DbAuditChanges;
  userId?: string | null;
};

/**
 * Format a human-readable one-line message for a DB audit event.
 */
function formatReadableMessage(params: LogDbAuditParams): string {
  const { table, operation, scopeOrId, changes } = params;
  const scopePart = scopeOrId != null && scopeOrId !== "" ? ` ${scopeOrId}` : "";
  const parts: string[] = [];
  for (const [field, change] of Object.entries(changes)) {
    const c = Array.isArray(change) ? change[0] : change;
    if (c && typeof c === "object" && "old" in c && "new" in c) {
      const o = c.old;
      const n = c.new;
      if (o === n) {
        parts.push(`${field} ${String(n)} (unchanged)`);
      } else {
        parts.push(`${field} ${String(o)}→${String(n)}`);
      }
    }
  }
  const changesStr = parts.length > 0 ? ` | ${parts.join(", ")}` : "";
  return `DB audit: ${table}${scopePart} ${operation}${changesStr}`;
}

/**
 * Send a DB audit log to the API route (which writes to the logs table).
 * Fire-and-forget: does not await. Does not throw. On failure the save flow is unaffected.
 */
export function logDbAudit(params: LogDbAuditParams): void {
  const message = formatReadableMessage(params);
  const meta = {
    type: "db_audit" as const,
    table: params.table,
    operation: params.operation,
    scope_or_id: params.scopeOrId ?? null,
    changes: params.changes,
    user_id: params.userId ?? null,
  };
  fetch(AUDIT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, meta }),
  }).catch(() => {
    // Fire-and-forget: avoid unhandled rejection; do not block or toast
  });
}
