import { createClient } from "@/lib/supabase/server";

/**
 * Server-side audit log: insert a db_audit row into logs with the current user.
 * Call from Server Actions after a successful mutation. Fire-and-forget; does not throw.
 */
export async function logDbAuditServer(
  message: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const metaWithUser = { ...meta, type: "db_audit", user_id: user?.id ?? null };
    await supabase.from("logs").insert({
      level: "info",
      message,
      meta: metaWithUser,
    });
  } catch {
    // Non-blocking; do not throw
  }
}
