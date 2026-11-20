"use server";

import { createClient } from "@/lib/supabase/server";

export type GetSessionResult =
  | { user: { id: string }; error: null }
  | { user: null; error: string };

/**
 * Server Action: return current session user id (or error). Used for refetch after auth change.
 */
export async function getSession(): Promise<GetSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  if (!user) return { user: null, error: "Not signed in." };
  return { user: { id: user.id }, error: null };
}
