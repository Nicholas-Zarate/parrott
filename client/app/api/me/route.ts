import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, ConsoleUserInformation } from "@/lib/auth-user-types";

const CONSOLE_COOKIE_NAME = "parrott_console_verified";
const CONSOLE_TS_COOKIE = "parrott_console_ts";
const CONSOLE_INFO_COOKIE = "parrott_console_info";

/**
 * GET /api/me
 * Returns the unified app user: Discord attributes (if logged in with Discord)
 * and console login attributes (if verified via console code).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const consoleVerified =
    cookieStore.get(CONSOLE_COOKIE_NAME)?.value === "1";
  const consoleTimestamp =
    cookieStore.get(CONSOLE_TS_COOKIE)?.value ?? null;
  let consoleUserInformation: ConsoleUserInformation | null = null;
  const infoRaw = cookieStore.get(CONSOLE_INFO_COOKIE)?.value;
  if (infoRaw) {
    try {
      const parsed = JSON.parse(infoRaw) as {
        userAgent?: string;
        ip?: string | null;
      };
      consoleUserInformation = {
        userAgent: typeof parsed.userAgent === "string" ? parsed.userAgent : "",
        ip: parsed.ip ?? null,
      };
    } catch {
      // ignore invalid JSON
    }
  }

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

  if (consoleVerified) {
    appUser.consoleUser = true;
    appUser.consoleTimestamp = consoleTimestamp;
    appUser.consoleUserInformation = consoleUserInformation;
  }

  return NextResponse.json(appUser);
}
