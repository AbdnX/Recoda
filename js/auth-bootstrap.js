/**
 * Shared Supabase bootstrap for browser entrypoints.
 * Centralizes config loading and client initialization.
 */

let createClientLoader = null;

function getApiBases() {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return [''];
  }

  return [
    '',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8001',
    'http://127.0.0.1:8001'
  ];
}

async function getCreateClient() {
  if (!createClientLoader) {
    createClientLoader = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then((m) => m.createClient);
  }
  return createClientLoader;
}

export async function fetchSupabaseConfig() {
  const apiBases = getApiBases();

  for (const base of apiBases) {
    try {
      const res = await fetch(`${base}/api/config/supabase`);
      if (!res.ok) continue;
      const cfg = await res.json();
      if (!cfg?.url || !cfg?.anonKey) continue;
      return { url: cfg.url, anonKey: cfg.anonKey };
    } catch (_err) {
      // Try next candidate base URL.
    }
  }

  return null;
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

export async function redirectIfAuthenticated(supabase, targetPath = 'app.html') {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = targetPath;
    return true;
  }
  return false;
}
