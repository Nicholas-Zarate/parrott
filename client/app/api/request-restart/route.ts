import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
 * RLS allows insert for authenticated users. Agent consumes and notifies overseer role.
 */
export async function POST(request: Request) {
  let body: { target?: unknown; guildId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isTarget(body.target)) {
    return NextResponse.json(
      { error: "target must be 'voice' or 'parrot'" },
      { status: 400 }
    );
  }

  const guildId =
    body.guildId != null && typeof body.guildId === "string"
      ? body.guildId.trim() || null
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("restart_requests").insert({
    guild_id: guildId,
    target: body.target,
    message: DEFAULT_MESSAGE,
    status: "pending",
    user_id: user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
