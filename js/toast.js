/**
 * Toast notification system.
 * Self-contained DOM creation + auto-removal.
 */

import { $ } from './utils.js';

/**
 * Show a toast notification.
 * @param {string} msg - The message to display.
 * @param {'error'|'success'|'info'} type - Toast type (determines accent color).
 * @param {number} duration - Time in ms before auto-dismiss. 0 = persistent until next toast.
 */
export function showToast(msg, type = 'error', duration = 4000) {
  const container = $('toast-container');
  if (!container) return;

  // Clear any persistent (duration=0) toasts
  container.querySelectorAll('.toast.persistent').forEach(el => el.remove());

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);

  if (duration > 0) {
    setTimeout(() => {
      el.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  } else {
    el.classList.add('persistent');
  }
}
