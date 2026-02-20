/**
 * Landing Page Auth Persistence
 * Checks if user is logged in to update CTA buttons, but stays on landing page.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// CONFIG
let supabase = null;

async function initSupabase() {
  try {
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    const res = await fetch(`${API_BASE}/api/config/supabase`);
    if (!res.ok) throw new Error('Config fetch failed');
    const { url, anonKey } = await res.json();
    
    supabase = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'recoda-auth-token'
      }
    });
    
    // Check if already logged in to update UI
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      updateLandingUI(session.user);
    }
  
    // Handle auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        updateLandingUI(session.user);
      } else {
        // Reset UI if logged out? For now just stay as is
      }
    });
  } catch (err) {
    console.warn('[Recoda] Supabase landing-auth init skipped:', err.message);
  }
}

/**
 * Update Landing Page UI for Logged-in Users
 */
function updateLandingUI(user) {
  if (!user) return;

  // Find all auth links and change them to App links
  document.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;

    // Change "Login" or "Signup" links to go directly to App if logged in
    if (href.includes('/login') || href.includes('/signup') || href.includes('app.html')) {
      const text = a.textContent.toLowerCase().trim();
      
      if (text.includes('login')) {
        a.textContent = 'Open App';
        a.setAttribute('href', '/app');
      } else if (text.includes('sign') || text.includes('started')) {
        a.textContent = 'Open App';
        a.setAttribute('href', '/app');
      }
    }
  });

  // Specifically check hero button
  const heroBtn = document.querySelector('.hero-actions .btn-primary');
  if (heroBtn) {
    heroBtn.textContent = 'Open App →';
    heroBtn.setAttribute('href', '/app');
  }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
