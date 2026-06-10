import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton service-role Supabase client.
 * Uses process.env directly so it's safe to call before ConfigModule initialises.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before Supabase client is used.',
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}
