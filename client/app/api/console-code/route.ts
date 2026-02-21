import { NextResponse } from "next/server";

const CONSOLE_COOKIE_NAME = "parrott_console_verified";
const CONSOLE_TS_COOKIE = "parrott_console_ts";
const CONSOLE_INFO_COOKIE = "parrott_console_info";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
};

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip") ?? null;
}

/**
 * POST /api/console-code
 * Body: { code: string, userAgent?: string }. Compares to CONSOLE_CODE env.
 * On match, sets cookies (verified, timestamp, console info) and returns 204.
 */
export async function POST(request: Request) {
  let body: { code?: unknown; userAgent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code =
    typeof body.code === "string" ? body.code.trim() : "";
  const userAgent =
    typeof body.userAgent === "string" ? body.userAgent.trim() : null;

  const expected = (process.env.CONSOLE_CODE ?? "").trim();

  if (!expected) {
    return NextResponse.json(
      { error: "Console code not configured" },
      { status: 503 }
    );
  }

  if (code !== expected) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const timestamp = new Date().toISOString();
  const ip = getClientIp(request);
  const consoleInfo = JSON.stringify({
    userAgent: userAgent ?? request.headers.get("user-agent") ?? "",
    ip: ip ?? null,
  });

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(CONSOLE_COOKIE_NAME, "1", COOKIE_OPTS);
  res.cookies.set(CONSOLE_TS_COOKIE, timestamp, COOKIE_OPTS);
  res.cookies.set(CONSOLE_INFO_COOKIE, consoleInfo, COOKIE_OPTS);
  return res;
}
