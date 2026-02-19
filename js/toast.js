/**
 * Toast notification system.
 * Self-contained DOM creation + auto-removal.
 */

import { $ } from './utils.js';

const container = $('toast-container');

/**
 * Show a toast notification.
 * @param {string} msg - The message to display.
 * @param {'error'|'success'|'info'} type - Toast type (determines accent color).
 * @param {number} duration - Time in ms before auto-dismiss.
 */
export function showToast(msg, type = 'error', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}
