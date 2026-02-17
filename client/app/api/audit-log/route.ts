import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/audit-log
 * Inserts a db_audit log row into the logs table. RLS allows insert only when meta.type = 'db_audit'.
 * Attaches the authenticated user id to meta when available.
 */
export async function POST(request: Request) {
  let body: { message?: string; meta?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : null;
  const meta = body.meta && typeof body.meta === "object" ? body.meta : null;

  if (!message || !meta || meta.type !== "db_audit") {
    return NextResponse.json(
      { error: "message and meta (with type: db_audit) required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const metaWithUser = {
    ...meta,
    user_id: meta.user_id ?? user?.id ?? null,
  };

  const { error } = await supabase.from("logs").insert({
    level: "info",
    message,
    meta: metaWithUser,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
