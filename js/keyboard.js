/**
 * Keyboard shortcut bindings.
 */

import { getState } from './state.js';
import { startRecording, stopRecording, togglePause } from './recorder.js';

/** Initialize keyboard shortcuts */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts while typing in inputs
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    // Don't trigger shortcuts when modal is open
    if (document.querySelector('.dl-modal-backdrop.open')) return;

    const state = getState();

    if (e.code === 'Space' && state !== 'idle') {
      e.preventDefault();
      togglePause();
    }
    if (e.code === 'Escape' && state !== 'idle') {
      e.preventDefault();
      stopRecording();
    }
    if (e.code === 'KeyR' && state === 'idle') {
      e.preventDefault();
      startRecording();
    }
  });
}
