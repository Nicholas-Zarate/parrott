import { NextResponse } from "next/server";

/**
 * POST /api/logout
 * No-op for compatibility. Client calls Supabase signOut for Discord session.
 */
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
