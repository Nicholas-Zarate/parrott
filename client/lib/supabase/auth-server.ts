import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Server-only auth helper for Server Actions.
 * Returns the authenticated user or null with an error message.
 */
export async function getAuthenticatedUser(): Promise<
  { user: User } | { user: null; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  if (!user) return { user: null, error: "Not signed in." };
  return { user };
}
