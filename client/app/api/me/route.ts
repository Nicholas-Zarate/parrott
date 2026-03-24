import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/auth-user-types";

/**
 * GET /api/me
 * Returns the app user from Discord/session (Supabase user_metadata).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  const appUser: AppUser = {};

  if (supabaseUser?.user_metadata) {
    const m = supabaseUser.user_metadata as Record<string, unknown>;
    appUser.discord = {
      id: supabaseUser.id,
      avatar_url: (m.avatar_url as string | null) ?? null,
      full_name: (m.full_name as string | null) ?? null,
      name: (m.name as string | null) ?? null,
      preferred_username: (m.preferred_username as string | null) ?? null,
      email: (m.email as string | null) ?? null,
      picture: (m.picture as string | null) ?? null,
      provider_id: (m.provider_id as string | undefined),
      provider: (m.provider as string | undefined),
    };
  }

  return NextResponse.json(appUser);
}
