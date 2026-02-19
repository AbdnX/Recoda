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
import { getSettings, getMime, getConstraints, getVideoBitrate } from './settings.js';
import { addRecording, setPreviewRecording } from './recordings.js';
import { showPreview, showRecordingPreview } from './ui.js';

let mediaRecorder = null;
let chunks = [];
let screenStream = null;
let micStream = null;
let combinedStream = null;
let timerInterval = null;
let timerSeconds = 0;

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
  const timerEl = $('timer');
  const mime = mediaRecorder?.mimeType || 'video/webm';
  const blob = new Blob(chunks, { type: mime });
  const ext = getFileExtension(mime);
  const now = new Date();
  const filename = `rec-${getTimestamp(now)}.${ext}`;
  const url = URL.createObjectURL(blob);
  const duration = timerSeconds;

  const rec = { blob, url, filename, duration, mime, ts: now };
  addRecording(rec);
  setPreviewRecording(rec);
  cleanup();

  // Show recording in preview for instant playback
  showRecordingPreview(url);

  // Show the preview download button
  const dlBtn = document.getElementById('preview-dl-btn');
  if (dlBtn) dlBtn.style.display = '';

  if (timerEl) timerEl.textContent = formatTime(duration);
  showToast('Recording ready — play above or download from the list', 'success', 4000);
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

// ─── Public API ─────────────────────────────────────────────

export function initRecorder() {
  const btnStart = $('btn-start');
  const btnPause = $('btn-pause');
  const btnStop  = $('btn-stop');

  btnStart?.addEventListener('click', () => {
    if (getState() === 'idle') startRecording();
  });

  btnPause?.addEventListener('click', () => {
    togglePause();
  });

  btnStop?.addEventListener('click', () => {
    stopRecording();
  });
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

    // ─── 3-second countdown ─────────────────────────────────
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
  setState('idle');
}
