/**
 * UI updates driven by state changes.
 * Listens to state machine events and updates all DOM elements.
 */

import { $ } from './utils.js';
import { onStateChange } from './state.js';
import { lockSettings } from './settings.js';

/** Reset preview to placeholder state */
export function resetPreview() {
  const previewVideo = $('preview-video');
  const placeholder  = $('preview-placeholder');
  const timerEl      = $('timer');
  const doneView     = $('done-view');

  if (!previewVideo || !placeholder) return;

  previewVideo.srcObject = null;
  previewVideo.src = '';
  previewVideo.style.display = 'none';
  previewVideo.controls = false;
  previewVideo.muted = true;
  placeholder.style.display = '';
  if (timerEl) timerEl.textContent = '00:00:00';

  // Reset done-view
  if (doneView) {
    doneView.style.display = 'none';
    doneView.classList.remove('active');
  }
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
  const btnStart     = $('btn-start');
  const btnPause     = $('btn-pause');
  const btnStop      = $('btn-stop');
  const pauseIcon    = $('pause-icon');
  const pauseLabel   = $('pause-label');
  const timerEl      = $('timer');
  const statusDot    = $('status-dot');
  const statusLabel  = $('status-label');
  const recBadge     = $('rec-badge');
  const recBadgeLabel = $('rec-badge-label');

  if (!btnStart) return;

  // Buttons
  if (state === 'idle') {
    btnStart.style.display = '';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    btnStart.disabled = false;
  } else {
    btnStart.style.display = 'none';
    btnPause.style.display = '';
    btnStop.style.display = '';
    btnPause.disabled = false;
    btnStop.disabled = false;
  }

  // Lock settings during recording
  lockSettings(state !== 'idle');

  // Status dot
  if (statusDot) {
    statusDot.className = 'status-dot';
    if (state === 'idle') {
      statusDot.classList.add('ready');
      if (statusLabel) statusLabel.textContent = 'Ready';
    } else if (state === 'recording') {
      statusDot.classList.add('recording');
      if (statusLabel) statusLabel.textContent = 'Recording';
    } else if (state === 'paused') {
      statusDot.classList.add('paused');
      if (statusLabel) statusLabel.textContent = 'Paused';
    }
  }

  // Timer
  if (timerEl) {
    timerEl.className = 'timer';
    if (state === 'recording') timerEl.classList.add('recording');
    if (state === 'paused') timerEl.classList.add('paused');
  }

  // Rec badge
  if (recBadge) {
    recBadge.className = 'rec-badge';
    if (state === 'recording') {
      recBadge.classList.add('active');
      if (recBadgeLabel) recBadgeLabel.textContent = 'REC';
    } else if (state === 'paused') {
      recBadge.classList.add('active', 'paused');
      if (recBadgeLabel) recBadgeLabel.textContent = 'PAUSED';
    }
  }

  // Pause button
  if (pauseLabel) {
    if (state === 'paused') {
      pauseLabel.textContent = 'Resume';
      pauseIcon?.setAttribute('data-lucide', 'play');
    } else {
      pauseLabel.textContent = 'Pause';
      pauseIcon?.setAttribute('data-lucide', 'pause');
    }
  }

  // Re-render icons
  if (window.lucide) lucide.createIcons();
}

/** Initialize UI by subscribing to state changes */
export function initUI() {
  onStateChange(({ state }) => applyState(state));
  if (window.lucide) lucide.createIcons();
}
