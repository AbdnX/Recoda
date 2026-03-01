/**
 * UI updates driven by state changes.
 * Listens to state machine events and updates all DOM elements.
 * Owns all body state-class management (replaces the MutationObserver).
 */

import { $ } from './utils.js';
import { onStateChange } from './state.js';
import { lockSettings } from './settings.js';

/** Reset preview to placeholder state */
export function resetPreview() {
  const previewVideo = $('preview-video');
  const placeholder  = $('preview-placeholder');
  const timerEl      = $('timer');

  if (!previewVideo || !placeholder) return;

  previewVideo.srcObject = null;
  previewVideo.src = '';
  previewVideo.style.display = 'none';
  previewVideo.controls = false;
  previewVideo.muted = true;
  placeholder.style.display = '';
  if (timerEl) timerEl.textContent = '00:00:00';
}

/** Show the screen stream in the preview monitor */
export function showPreview(stream) {
  const previewVideo = $('preview-video');
  const placeholder  = $('preview-placeholder');

  if (!previewVideo || !placeholder) return;

  previewVideo.srcObject = stream;
  previewVideo.muted = true;
  previewVideo.controls = false;
  previewVideo.style.display = '';
  placeholder.style.display = 'none';
}

/** Show a recorded blob in the preview for playback */
export function showRecordingPreview(url) {
  const previewVideo = $('preview-video');
  const placeholder  = $('preview-placeholder');

  if (!previewVideo || !placeholder) return;

  previewVideo.srcObject = null;
  previewVideo.src = url;
  previewVideo.muted = false;
  previewVideo.controls = true;
  previewVideo.style.display = '';
  placeholder.style.display = 'none';
}

/** Apply UI changes based on the new state */
function applyState(state) {
  const btnStart      = $('btn-start');
  const btnPause      = $('btn-pause');
  const btnStop       = $('btn-stop');
  const pauseIcon     = $('pause-icon');
  const pauseLabel    = $('pause-label');
  const timerEl       = $('timer');
  const statusDot     = $('status-dot');
  const statusLabel   = $('status-label');
  const recBadge      = $('rec-badge');
  const recBadgeLabel = $('rec-badge-label');
  const savingOvl     = $('saving-overlay');
  const countdownOvl  = $('countdown-overlay');

  if (!btnStart) return;

  // ── 1. Body state class — canonical visibility driver ───────
  const allStates = ['idle', 'source-picker', 'countdown', 'recording', 'paused', 'saving', 'done'];
  document.body.classList.remove(...allStates.map(s => `state-${s}`));
  document.body.classList.add(`state-${state}`);

  // ── 2. Lock settings during active phases ───────────────────
  lockSettings(['recording', 'paused', 'countdown', 'saving'].includes(state));

  // ── 3. Overlay visibility (belt-and-suspenders alongside CSS)
  if (savingOvl)    savingOvl.classList.toggle('visible', state === 'saving');
  if (countdownOvl) countdownOvl.classList.toggle('visible', state === 'countdown');

  // ── 4. Status dot + label ────────────────────────────────────
  const statusMap = {
    'idle':          ['ready',     'READY'],
    'source-picker': ['ready',     'PICK SOURCES'],
    'countdown':     ['recording', 'STARTING'],
    'recording':     ['recording', 'RECORDING'],
    'paused':        ['paused',    'PAUSED'],
    'saving':        ['saving',    'SAVING'],
    'done':          ['done',      'SAVED'],
  };
  if (statusDot) {
    const [dotClass, labelText] = statusMap[state] || ['ready', 'READY'];
    statusDot.className = 'status-dot ' + dotClass;
    if (statusLabel) statusLabel.textContent = labelText;
  }

  // ── 5. Buttons ───────────────────────────────────────────────
  // btn-start: only visible on idle home screen
  btnStart.style.display = state === 'idle' ? '' : 'none';
  btnStart.disabled = false;

  // pause/stop: only during active recording phases
  if (btnPause) {
    btnPause.style.display = ['recording', 'paused'].includes(state) ? '' : 'none';
    btnPause.disabled = false;
  }
  if (btnStop) {
    btnStop.style.display = ['recording', 'paused'].includes(state) ? '' : 'none';
    btnStop.disabled = false;
  }

  // ── 6. Timer class ───────────────────────────────────────────
  if (timerEl) {
    timerEl.className = 'timer';
    if (state === 'recording') timerEl.classList.add('recording');
    if (state === 'paused')    timerEl.classList.add('paused');
  }

  // ── 7. Rec badge ─────────────────────────────────────────────
  if (recBadge) {
    recBadge.className = 'rec-badge';
    const badgeMap = {
      recording: { classes: ['active'],         text: 'REC' },
      paused:    { classes: ['active', 'paused'], text: 'PAUSED' },
      countdown: { classes: ['active'],         text: 'STARTING' },
    };
    if (badgeMap[state]) {
      badgeMap[state].classes.forEach(c => recBadge.classList.add(c));
      if (recBadgeLabel) recBadgeLabel.textContent = badgeMap[state].text;
    }
  }

  // ── 8. Pause button icon + label ─────────────────────────────
  if (pauseLabel) {
    if (state === 'paused') {
      pauseLabel.textContent = 'Resume';
      pauseIcon?.setAttribute('data-lucide', 'play');
    } else {
      pauseLabel.textContent = 'Pause';
      pauseIcon?.setAttribute('data-lucide', 'pause');
    }
  }

  // ── 9. Re-render Lucide icons ────────────────────────────────
  if (window.lucide) lucide.createIcons();
}

/** Initialize UI by subscribing to state changes */
export function initUI() {
  onStateChange(({ state }) => applyState(state));
  // Apply initial idle state immediately
  applyState('idle');
  if (window.lucide) lucide.createIcons();
}
