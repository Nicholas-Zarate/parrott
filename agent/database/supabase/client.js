/**
 * Shared Supabase client for the agent.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in env.
 */

const { createClient } = require('@supabase/supabase-js');

let _client = null;

/**
 * Return a Supabase client or null when env is not configured.
 * The client is created once and reused (singleton).
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
function getClient() {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return null;
    _client = createClient(url, key);
    return _client;
}

module.exports = { getClient };
