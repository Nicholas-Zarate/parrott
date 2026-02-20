"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import type { ActivityRow } from "@/components/activity-card";

const TABLE = "activity_listeners";
const LIMIT = 100;

export type FetchActivitiesListResult =
  | { data: ActivityRow[]; error: null }
  | { data: null; error: string };

/**
 * Fetch recent activity listener rows for the activities page. Requires authenticated user.
 */
export async function fetchActivitiesList(): Promise<FetchActivitiesListResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ActivityRow[], error: null };
}
