import { fetchSupabaseConfig, initSupabaseClient } from './auth-bootstrap.js';

let supabase = null;
let cachedConfig = null;

/**
 * Initialize and return the Supabase client.
 * Lazy-loaded on first call.
 * @returns {Promise<object>} Supabase client instance
 */
export async function getSupabase() {
  if (supabase) return supabase;

  cachedConfig = await fetchSupabaseConfig();
  if (!cachedConfig) {
    console.log('[Recoda] Supabase config unavailable — cloud features disabled');
    return null;
  }

  try {
    console.log('[Recoda] Initializing Supabase with backend config');
    supabase = await initSupabaseClient();
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    console.log('[Recoda] Session detected:', !!session);

    return supabase;
  } catch (err) {
    console.error('[Recoda] Failed to load/init Supabase:', err);
    return null;
  }
}

/**
 * Check if Supabase is configured (credentials are set).
 * @returns {boolean}
 */
export function isConfigured() {
  return !!cachedConfig;
}
