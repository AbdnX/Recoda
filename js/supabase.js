/**
 * Supabase client configuration.
 * 
 * To connect to your Supabase project:
 * 1. Go to https://supabase.com and create a project
 * 2. Go to Settings → API
 * 3. Copy your Project URL and anon/public key
 * 4. Replace the values below
 */

// ─── Your Supabase credentials ─────────────────────────────
// Default placeholders — will try to fetch real config from backend API
let SUPABASE_URL  = 'https://bcmtpbpniajwvtyftpxs.supabase.co';
let SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbXRwYnBuaWFqd3Z0eWZ0cHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDIyMTUsImV4cCI6MjA4NjcxODIxNX0.S4-QynZ3aXTzDoMsCN3O23A6zaRADVWRx-CZFeM7dPc';

// ─── Import Supabase client from CDN ────────────────────────
// We dynamically import from esm.sh CDN (no build tools needed)
let supabase = null;

/**
 * Initialize and return the Supabase client.
 * Lazy-loaded on first call.
 * @returns {Promise<object>} Supabase client instance
 */
export async function getSupabase() {
  if (supabase) return supabase;

  // Try to fetch config from backend API
  try {
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    const res = await fetch(`${API_BASE}/api/config/supabase`);
    if (res.ok) {
      const config = await res.json();
      SUPABASE_URL = config.url;
      SUPABASE_ANON = config.anonKey;
    }
  } catch (err) {
    console.log('[Recoda] Backend API not available, using local config');
  }

  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    return null;
  }

  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    
    console.log('[Recoda] Initializing Supabase with:', SUPABASE_URL);
    
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'recoda-auth-token'
      }
    });

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
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON !== 'YOUR_SUPABASE_ANON_KEY';
}
