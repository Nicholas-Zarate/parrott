import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

/** Fixed message for restart request (agent may vary with GPT-mini when processing). */
const DEFAULT_MESSAGE =
  "👻 yo, someone's gotta restart the server dog";

const VALID_TARGETS = ["voice", "parrot"] as const;
type Target = (typeof VALID_TARGETS)[number];

function isTarget(s: unknown): s is Target {
  return typeof s === "string" && VALID_TARGETS.includes(s as Target);
}

/**
 * POST /api/request-restart
 * Inserts a pending restart request. Body: { target: 'voice' | 'parrot', guildId?: string }.
 * Auth is verified with cookie-based client; insert uses service role to avoid RLS/JWT issues in Route Handlers.
 */
export async function POST(request: Request) {
  let body: { target?: unknown; guildId?: unknown };
  try {
    body = await request.json();
  } catch {
    console.warn("[request-restart] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isTarget(body.target)) {
    console.warn("[request-restart] Invalid target", body.target);
    return NextResponse.json(
      { error: "target must be 'voice' or 'parrot'" },
      { status: 400 }
    );
  }

  const guildId =
    body.guildId != null && typeof body.guildId === "string"
      ? body.guildId.trim() || null
      : null;

  console.log("[request-restart] Body", { target: body.target, guildId });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const insertPayload = {
    guild_id: guildId,
    target: body.target,
    message: DEFAULT_MESSAGE,
    status: "pending",
    user_id: user.id,
  };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("restart_requests")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    console.error("[request-restart] Insert failed", error.message, insertPayload);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[request-restart] Inserted row", inserted?.id, "target=" + body.target, "guild_id=" + (guildId ?? "null"));
  return new NextResponse(null, { status: 204 });
}
