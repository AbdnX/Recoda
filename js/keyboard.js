/**
 * Keyboard shortcut bindings.
 */

import { getState } from './state.js';
import { stopRecording, togglePause } from './recorder.js';

/** Initialize keyboard shortcuts */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts while typing in inputs
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    // Don't trigger shortcuts when modal is open
    if (document.querySelector('.dl-modal-backdrop.open')) return;

    const state = getState();

    // Space: pause/resume during recording only
    if (e.code === 'Space' && (state === 'recording' || state === 'paused')) {
      e.preventDefault();
      togglePause();
    }

    // Escape: cancel source picker → idle, or stop active recording
    if (e.code === 'Escape') {
      if (state === 'source-picker') {
        e.preventDefault();
        // Go back to idle by clicking cancel (or dispatch setState directly)
        document.getElementById('picker-cancel')?.click();
      } else if (state === 'recording' || state === 'paused') {
        e.preventDefault();
        stopRecording();
      }
    }

    // R: open source picker from idle (simulates btn-start click to reuse sync logic)
    if (e.code === 'KeyR' && state === 'idle') {
      e.preventDefault();
      document.getElementById('btn-start')?.click();
    }
  });
}
