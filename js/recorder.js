/**
 * Core recording engine.
 * Handles getDisplayMedia, MediaRecorder, audio mixing, start/pause/stop.
 */

import { $ } from './utils.js';
import { formatTime, getTimestamp, getFileExtension } from './utils.js';
import { getState, setState } from './state.js';
import { showToast } from './toast.js';
import { createAnalyser, mixAudioStreams, closeAudio } from './audio.js';
import { startMeters, stopMeters } from './meters.js';
import { openWebcam, closeWebcam, getWebcamStream } from './webcam.js';
import { getSettings, getMime, getConstraints, getVideoBitrate, setAudioSource, setWebcamEnabled } from './settings.js';
import { addRecording, setPreviewRecording } from './recordings.js';
import { showPreview, showRecordingPreview } from './ui.js';

let mediaRecorder = null;
let chunks = [];
let screenStream = null;
let micStream = null;
let combinedStream = null;
let timerInterval = null;
let timerSeconds = 0;

// Tracks the "selected" state of source picker tiles (also reflects home chip state)
let pickerMicActive    = true;   // default: mic on
let pickerCameraActive = false;  // default: webcam off
let pickerSystemActive = false;  // default: system audio off

// ─── Timer ──────────────────────────────────────────────────

function startTimer() {
  const timerEl = $('timer');
  if (!timerEl) return;

  timerSeconds = 0;
  timerEl.textContent = '00:00:00';
  timerInterval = setInterval(() => {
    if (getState() === 'recording') {
      timerSeconds++;
      timerEl.textContent = formatTime(timerSeconds);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ─── Cleanup ────────────────────────────────────────────────

function cleanup() {
  const webcamPip = $('webcam-pip');
  stopMeters();
  if (screenStream) { screenStream.getTracks().forEach((t) => t.stop()); screenStream = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  const ws = getWebcamStream();
  if (ws) { ws.getTracks().forEach((t) => t.stop()); }
  closeWebcam();
  if (webcamPip) webcamPip.classList.remove('visible');
  combinedStream = null;
  closeAudio();
}

// ─── On Stop Handler ────────────────────────────────────────

function onStopped() {
  const mime     = mediaRecorder?.mimeType || 'video/webm';
  const blob     = new Blob(chunks, { type: mime });
  const ext      = getFileExtension(mime);
  const now      = new Date();
  const filename = `rec-${getTimestamp(now)}.${ext}`;
  const url      = URL.createObjectURL(blob);
  const duration = timerSeconds;

  const rec = { blob, url, filename, duration, mime, ts: now };
  addRecording(rec);
  setPreviewRecording(rec);
  cleanup();

  // Populate done-view fields (visibility is driven by CSS state class)
  const df = $('done-filename'); if (df) df.textContent = filename;
  const dd = $('done-duration'); if (dd) dd.textContent = formatTime(duration);
  const ds = $('done-size');     if (ds) ds.textContent = (blob.size / (1024 * 1024)).toFixed(1) + ' MB';
  const te = $('timer');         if (te) te.textContent = formatTime(duration);

  // Show recording in preview for instant playback in done-view
  showRecordingPreview(url);

  // Animate saving progress bar then transition to done
  const fill   = $('saving-progress');
  const status = $('saving-status');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0';
    void fill.offsetWidth; // force reflow so animation re-fires
    fill.style.transition = 'width 1.4s ease';
    fill.style.width = '100%';
  }
  if (status) status.textContent = 'Finalizing...';

  setTimeout(() => {
    setState('done');
    showToast('Recording saved — view in Library or download', 'success', 4000);
  }, 1500);
}

// ─── Countdown ──────────────────────────────────────────────

/**
 * Show a 3-2-1 countdown overlay.
 * Returns a promise that resolves after the countdown completes.
 */
function runCountdown() {
  const countdownOverlay = $('countdown-overlay');
  const countdownNumber  = $('countdown-number');

  if (!countdownOverlay || !countdownNumber) return Promise.resolve();

  return new Promise((resolve) => {
    let count = 3;
    countdownNumber.textContent = count;
    countdownOverlay.classList.add('visible');

    // Re-trigger animation for the number + ring
    function animateTick() {
      const numEl = countdownNumber;
      const ringEl = countdownOverlay.querySelector('.countdown-ring');
      if (numEl) numEl.style.animation = 'none';
      if (ringEl) ringEl.style.animation = 'none';
      // Force reflow
      void numEl?.offsetWidth;
      void ringEl?.offsetWidth;
      if (numEl) numEl.style.animation = '';
      if (ringEl) ringEl.style.animation = '';
    }

    animateTick();

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNumber.textContent = count;
        animateTick();
      } else {
        clearInterval(interval);
        countdownOverlay.classList.remove('visible');
        resolve();
      }
    }, 1000);
  });
}

// ─── Picker Helpers ─────────────────────────────────────────

/** Read the current settings selects and sync picker flags + tile classes to match */
function syncPickerToSettings() {
  const val = $('audio-source')?.value || 'none';
  pickerMicActive    = val === 'mic' || val === 'both';
  pickerSystemActive = val === 'system' || val === 'both';
  pickerCameraActive = getSettings().webcamEnabled;

  $('picker-mic')   ?.classList.toggle('active', pickerMicActive);
  $('picker-camera')?.classList.toggle('active', pickerCameraActive);
  $('picker-system')?.classList.toggle('active', pickerSystemActive);

  $('chip-mic')    ?.classList.toggle('active', pickerMicActive);
  $('chip-camera') ?.classList.toggle('active', pickerCameraActive);
  $('chip-system') ?.classList.toggle('active', pickerSystemActive);
}

/** Write the picker flags back to the settings selects */
function syncPickerState() {
  let audioVal = 'none';
  if (pickerMicActive && pickerSystemActive) audioVal = 'both';
  else if (pickerMicActive)                   audioVal = 'mic';
  else if (pickerSystemActive)                audioVal = 'system';

  setAudioSource(audioVal);
  setWebcamEnabled(pickerCameraActive);

  // Keep home chips in sync with picker
  $('chip-mic')    ?.classList.toggle('active', pickerMicActive);
  $('chip-camera') ?.classList.toggle('active', pickerCameraActive);
  $('chip-system') ?.classList.toggle('active', pickerSystemActive);

  updatePickerSummary();
}

/** Update the text summary below the picker grid */
function updatePickerSummary() {
  const el = $('picker-summary');
  if (!el) return;
  const parts = ['Screen'];
  if (pickerMicActive)    parts.push('Mic');
  if (pickerCameraActive) parts.push('Camera');
  if (pickerSystemActive) parts.push('System Audio');
  el.textContent = parts.join(' + ') + ' selected';
}

// ─── Public API ─────────────────────────────────────────────

export function initRecorder() {
  // Home CTA → open source picker
  $('btn-start')?.addEventListener('click', () => {
    if (getState() === 'idle') {
      setState('source-picker');
      syncPickerToSettings();
      updatePickerSummary();
    }
  });

  // Source picker → start recording
  $('picker-start')?.addEventListener('click', () => {
    if (getState() === 'source-picker') startRecording();
  });

  // Source picker → cancel
  $('picker-cancel')?.addEventListener('click', () => {
    if (getState() === 'source-picker') setState('idle');
  });

  // Picker tiles — toggle active state and sync to settings
  const tileToggle = (id, flag) => {
    $(id)?.addEventListener('click', () => {
      if (flag === 'mic')    pickerMicActive    = !pickerMicActive;
      if (flag === 'camera') pickerCameraActive = !pickerCameraActive;
      if (flag === 'system') pickerSystemActive = !pickerSystemActive;

      const active = flag === 'mic' ? pickerMicActive
                   : flag === 'camera' ? pickerCameraActive
                   : pickerSystemActive;
      $(id)?.classList.toggle('active', active);
      syncPickerState();
    });
  };
  tileToggle('picker-mic', 'mic');
  tileToggle('picker-camera', 'camera');
  tileToggle('picker-system', 'system');

  // Home chips — same toggle, also syncs back to picker
  const chipToggle = (id, flag) => {
    $(id)?.addEventListener('click', () => {
      if (flag === 'mic')    pickerMicActive    = !pickerMicActive;
      if (flag === 'camera') pickerCameraActive = !pickerCameraActive;
      if (flag === 'system') pickerSystemActive = !pickerSystemActive;
      syncPickerState();
    });
  };
  chipToggle('chip-mic', 'mic');
  chipToggle('chip-camera', 'camera');
  chipToggle('chip-system', 'system');

  // Recording controls
  $('btn-pause')?.addEventListener('click', togglePause);
  $('btn-stop')?.addEventListener('click', stopRecording);
}

export async function startRecording() {
  try {
    chunks = [];
    const settings = getSettings();
    const requestSysAudio = settings.audioSource === 'system' || settings.audioSource === 'both';

    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: getConstraints(),
      audio: requestSysAudio,
    });

    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      if (getState() !== 'idle') stopRecording();
    });

    // Preview
    showPreview(screenStream);

    // Tracks
    const tracks = [...screenStream.getVideoTracks()];
    const sysAudio = screenStream.getAudioTracks();
    const hasSys = sysAudio.length > 0;
    let hasMic = false;

    if (settings.audioSource === 'mic' || settings.audioSource === 'both') {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        hasMic = true;
      } catch (e) {
        showToast('Microphone denied — recording without mic.', 'info');
      }
    }

    // Mix audio & setup analysers
    let micAnalyser = null;
    let sysAnalyser = null;

    if (hasSys && hasMic && settings.audioSource === 'both') {
      const mixedTracks = mixAudioStreams(new MediaStream(sysAudio), micStream);
      tracks.push(...mixedTracks);
      sysAnalyser = createAnalyser(new MediaStream(sysAudio));
      micAnalyser = createAnalyser(micStream);
    } else if (hasSys && (settings.audioSource === 'system' || settings.audioSource === 'both')) {
      tracks.push(...sysAudio);
      sysAnalyser = createAnalyser(new MediaStream(sysAudio));
    } else if (hasMic) {
      tracks.push(...micStream.getAudioTracks());
      micAnalyser = createAnalyser(micStream);
    }

    startMeters(micAnalyser, sysAnalyser);

    combinedStream = new MediaStream(tracks);

    const mime = getMime();
    const opts = {};
    if (mime) opts.mimeType = mime;
    opts.videoBitsPerSecond = getVideoBitrate();

    mediaRecorder = new MediaRecorder(combinedStream, opts);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = onStopped;

    // ─── 3-second countdown (with proper state) ─────────────
    setState('countdown');
    await runCountdown();

    // Start recording after countdown
    mediaRecorder.start();

    const webcamPip = $('webcam-pip');
    if (settings.webcamEnabled) {
       await openWebcam();
       if (webcamPip) webcamPip.classList.add('visible');
    }

    setState('recording');
    startTimer();
    showToast('Recording started', 'success', 2000);

  } catch (err) {
    cleanup();
    setState('idle');
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      showToast('Screen capture denied. Please allow access to record.', 'error');
    } else {
      showToast(`Error: ${err.message}`, 'error');
    }
  }
}

export function togglePause() {
  if (getState() === 'recording' && mediaRecorder) {
    mediaRecorder.pause();
    setState('paused');
  } else if (getState() === 'paused' && mediaRecorder) {
    mediaRecorder.resume();
    setState('recording');
  }
}

export function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  stopTimer();
  setState('saving');
  // mediaRecorder.onstop fires onStopped() asynchronously
  // onStopped() will call setState('done') after processing + 1.5s animation
}
