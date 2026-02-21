import { NextResponse } from "next/server";

const CONSOLE_COOKIE_NAME = "parrott_console_verified";
const CONSOLE_TS_COOKIE = "parrott_console_ts";
const CONSOLE_INFO_COOKIE = "parrott_console_info";

const CLEAR_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

/**
 * POST /api/logout
 * Clears console auth cookies. Client should also call Supabase signOut for Discord.
 */
export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(CONSOLE_COOKIE_NAME, "", CLEAR_OPTS);
  res.cookies.set(CONSOLE_TS_COOKIE, "", CLEAR_OPTS);
  res.cookies.set(CONSOLE_INFO_COOKIE, "", CLEAR_OPTS);
  return res;
}
