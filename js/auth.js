/**
 * Auth module: handles login, signup, logout, and user session state.
 * Manages the user menu UI in the app workspace.
 */

import { $ } from './utils.js';
import { getSupabase } from './supabase.js';
import { showToast } from './toast.js';
import { navigateTo, getCurrentPage } from './router.js';
import { refreshRecordings } from './recordings.js';

let currentUser = null;

/**
 * Get the currently logged-in user.
 * @returns {object|null}
 */
export function getUser() {
  return currentUser;
}

/**
 * Initialize auth: check current session and set up listeners.
 */
export async function initAuth() {
  const sb = await getSupabase();
  if (!sb) {
    console.log('Supabase not configured — running in local-only mode');
    updateUI(null);
    return;
  }

  // Check initial session
  const { data: { session } } = await sb.auth.getSession();
  
  handleSession(session);

  // Listen for auth changes
  sb.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });

  // Wire up UI events
  setupEvents();
}

/**
 * Handle session update
 */
function handleSession(session) {
  currentUser = session ? session.user : null;
  updateUI(currentUser);
  
  if (currentUser) {
    refreshRecordings();
  }
}

/**
 * Setup event listeners for auth UI
 */
function setupEvents() {
  // Use event delegation or check for existence at runtime
  const userMenuBtn = $('user-menu-btn');
  const userMenu    = $('user-menu');
  const navLogin    = $('nav-login');
  const logoutBtn   = $('btn-logout');

  // Toggle user menu
  userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (userMenu) {
      const isVisible = userMenu.style.display === 'flex';
      userMenu.style.display = isVisible ? 'none' : 'flex';
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (userMenu && !userMenu.contains(e.target) && !userMenuBtn?.contains(e.target)) {
      userMenu.style.display = 'none';
    }
  });

  // Redirect to standalone login/signup pages
  navLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/login';
  });

  // Logout
  logoutBtn?.addEventListener('click', async () => {
    await logout();
  });
}

/**
 * Log out
 */
async function logout() {
  const sb = await getSupabase();
  if (!sb) return;

  const { error } = await sb.auth.signOut();
  if (error) {
    showToast(error.message, 'error');
  } else {
    showToast('Logged out', 'info');
    const userMenu = $('user-menu');
    if (userMenu) userMenu.style.display = 'none';
    // After logout, we go back to landing
    window.location.href = 'index.html';
  }
}

/**
 * Update UI based on auth state
 */
export function updateUI(user) {
  const userMenuBtn = $('user-menu-btn');
  const navLogin    = $('nav-login');
  const userAvatar  = $('user-avatar');
  const userName    = $('user-name');
  const userEmail   = $('user-email');

  console.log('[Recoda] Updating Auth UI. User:', user ? user.email : 'None');

  // Update User Menu in Sidebar
  if (userMenuBtn) {
    userMenuBtn.style.display = user ? 'flex' : 'none';
  }
  
  // Update Login Link in Sidebar
  if (navLogin) {
    navLogin.style.display = user ? 'none' : 'flex';
  }

  // Set avatar/name if logged in
  if (user) {
    const email = user.email;
    if (userEmail) userEmail.textContent = email;
    if (userName) userName.textContent = email.split('@')[0];
    if (userAvatar) userAvatar.textContent = email[0].toUpperCase();
  }

  // Ensure icons are rendered for any changed elements
  if (window.lucide) {
    lucide.createIcons();
  }
}
