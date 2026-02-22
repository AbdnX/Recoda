/**
 * Shared Supabase bootstrap for browser entrypoints.
 * Centralizes config loading and client initialization.
 */

let createClientLoader = null;

function getApiBase() {
  return window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
}

async function getCreateClient() {
  if (!createClientLoader) {
    createClientLoader = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then((m) => m.createClient);
  }
  return createClientLoader;
}

export async function fetchSupabaseConfig() {
  try {
    const res = await fetch(`${getApiBase()}/api/config/supabase`);
    if (!res.ok) return null;
    const cfg = await res.json();
    if (!cfg?.url || !cfg?.anonKey) return null;
    return { url: cfg.url, anonKey: cfg.anonKey };
  } catch (_err) {
    return null;
  }
}

export async function initSupabaseClient(options = {}) {
  const config = await fetchSupabaseConfig();
  if (!config) return null;

  const createClient = await getCreateClient();
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'recoda-auth-token',
      ...(options.auth || {})
    }
  });
}

export async function redirectIfAuthenticated(supabase, targetPath = '/app') {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = targetPath;
    return true;
  }
  return false;
}
