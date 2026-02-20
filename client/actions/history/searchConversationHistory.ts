"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import type { SearchConversationParams } from "@/lib/history-search";

export type HistoryRow = {
  id: string;
  created_at: string | null;
  channel_id: string | null;
  user_text: string | null;
  response_text: string | null;
  tools_called: string[] | null;
  rank?: number;
};

export type SearchConversationHistoryResult =
  | { data: HistoryRow[]; error: null }
  | { data: null; error: string };

/**
 * Server Action: call search_conversation_history RPC. Requires authenticated user.
 */
export async function searchConversationHistory(
  params: SearchConversationParams
): Promise<SearchConversationHistoryResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return { data: null, error: auth.error };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_conversation_history", params);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as HistoryRow[], error: null };
}
