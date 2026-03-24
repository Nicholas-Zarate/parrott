import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key. Bypasses RLS.
 * Use only in API routes / server actions after verifying the user with the cookie-based client.
 * Do not expose this client to the browser. Requires SUPABASE_SERVICE_ROLE_KEY in env.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for admin client"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}
