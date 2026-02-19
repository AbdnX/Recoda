/**
 * Landing Page Auth Persistence
 * Checks if user is logged in to update CTA buttons, but stays on landing page.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// CONFIG
const SUPABASE_URL = 'https://bcmtpbpniajwvtyftpxs.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbXRwYnBuaWFqd3Z0eWZ0cHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDIyMTUsImV4cCI6MjA4NjcxODIxNX0.S4-QynZ3aXTzDoMsCN3O23A6zaRADVWRx-CZFeM7dPc';
let supabase = null;

async function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Check if already logged in to update UI
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    updateLandingUI(session.user);
  }

  // Handle auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      updateLandingUI(session.user);
    }
  });
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
    // But keep the requested labels: "Login" and "Sign up"
    if (href.includes('/login') || href.includes('/signup') || href.includes('app.html')) {
      const text = a.textContent.toLowerCase();
      
      if (text.includes('login')) {
        a.textContent = 'Login';
        a.setAttribute('href', '/app');
      } else if (text.includes('sign') || text.includes('started')) {
        a.textContent = 'Sign up';
        a.setAttribute('href', '/app');
      }
    }
  });

  // Specifically check hero button
  const heroBtn = document.querySelector('.hero-actions .btn-primary');
  if (heroBtn) {
    heroBtn.textContent = 'Sign up';
    heroBtn.setAttribute('href', '/app');
  }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
