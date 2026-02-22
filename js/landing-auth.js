/**
 * Landing Page Auth Persistence
 * Checks if user is logged in to update CTA buttons, but stays on landing page.
 */

import { initSupabaseClient } from './auth-bootstrap.js';

// CONFIG
let supabase = null;

async function initSupabase() {
  try {
    supabase = await initSupabaseClient();
    if (!supabase) throw new Error('Supabase config unavailable');
    
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
