/**
 * Client-side Router
 * Manages display of different "pages" within app.html based on URL hashes.
 */

import { $ } from './utils.js';

// Page mapping
const pages = {
  'home': $('page-home'),
  'library': $('page-library'),
  'settings': $('page-settings'),
  'player': $('page-player')
};

// Nav mapping
const navItems = {
  'home': $('nav-home'),
  'library': $('nav-library'),
  'settings': $('nav-settings')
};

/**
 * Navigate to a specific page ID.
 * @param {string} pageId 
 */
export function navigateTo(pageId) {
  if (!pages[pageId]) pageId = 'home';

  // Toggle sections
  Object.keys(pages).forEach(id => {
    if (pages[id]) {
      pages[id].classList.toggle('active', id === pageId);
    }
  });

  // Toggle nav items
  Object.keys(navItems).forEach(id => {
    if (navItems[id]) {
      navItems[id].classList.toggle('active', id === pageId);
    }
  });

  // Update hash if needed
  if (window.location.hash !== `#${pageId}`) {
    window.location.hash = pageId;
  }
}

/**
 * Get current page ID from hash.
 * @returns {string}
 */
export function getCurrentPage() {
  return window.location.hash.replace('#', '') || 'home';
}

/**
 * Initialize router: listen for hash changes and handle initial load.
 */
export function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    
    // Auth modals handled by auth.js checkHashForAuth()
    if (hash === 'login' || hash === 'signup') {
       // We keep current page, auth module will open modal
       return;
    }
    
    navigateTo(hash || 'home');
  });

  // Move to initial page
  const initial = window.location.hash.replace('#', '');
  if (initial === 'login' || initial === 'signup') {
    navigateTo('home');
  } else {
    navigateTo(initial || 'home');
  }
}
