/**
 * Settings panel: toggle, format/quality/audio selectors, webcam toggle.
 */

import { $ } from './utils.js';
import { getState } from './state.js';
import { openWebcam, closeWebcam } from './webcam.js';

let webcamEnabled = false;

/** Check browser MP4 MediaRecorder support */
export const mp4Supported =
  typeof MediaRecorder !== 'undefined' &&
  (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,opus') ||
   MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ||
   MediaRecorder.isTypeSupported('video/mp4'));

/**
 * Get the best MIME type based on current format setting.
 * @returns {string} MIME type string, or '' if none supported.
 */
export function getMime() {
  const formatSel = $('output-format');
  if (!formatSel) return '';
  
  const f = formatSel.value;
  if (f === 'mp4' || (f === 'auto' && mp4Supported)) {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,opus')) return 'video/mp4;codecs=avc1,opus';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) return 'video/mp4;codecs=avc1';
    if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  }
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  return '';
}

/**
 * Get current settings values.
 * @returns {{ audioSource: string, quality: string, webcamEnabled: boolean }}
 */
export function getSettings() {
  const audioSourceSel = $('audio-source');
  const qualitySel     = $('video-quality');
  
  return {
    audioSource: audioSourceSel?.value || 'none',
    quality: qualitySel?.value || '1080',
    webcamEnabled,
  };
}

/**
 * Get display constraints based on quality setting.
 * @returns {object} Video constraints object.
 */
export function getConstraints() {
  const qualitySel = $('video-quality');
  const q = qualitySel?.value || '1080';
  const video = { cursor: 'always' };
  if (q === '720') { video.width = { ideal: 1280 }; video.height = { ideal: 720 }; }
  if (q === '1080') { video.width = { ideal: 1920 }; video.height = { ideal: 1080 }; }
  return video;
}

/**
 * Get the video bitrate based on quality.
 * @returns {number}
 */
export function getVideoBitrate() {
  const qualitySel = $('video-quality');
  return qualitySel?.value === '720' ? 2500000 : 5000000;
}

/** Lock settings controls during recording */
export function lockSettings(locked) {
  const audioSourceSel = $('audio-source');
  const qualitySel     = $('video-quality');
  const formatSel      = $('output-format');

  if (audioSourceSel) audioSourceSel.disabled = locked;
  if (qualitySel) qualitySel.disabled = locked;
  if (formatSel) formatSel.disabled = locked;
}

/** Initialize all settings event listeners */
export function initSettings() {
  const settingsToggle = $('settings-toggle');
  const settingsPanel  = $('settings-panel');
  const toggleWebcamEl = $('toggle-webcam');
  const webcamStatusTx = $('webcam-status-text');
  const formatSel      = $('output-format');

  // Panel toggle
  settingsToggle?.addEventListener('click', () => {
    const open = settingsPanel.classList.toggle('open');
    settingsToggle.classList.toggle('open', open);
  });

  // Webcam toggle
  toggleWebcamEl?.addEventListener('click', () => {
    webcamEnabled = !webcamEnabled;
    toggleWebcamEl.classList.toggle('on', webcamEnabled);
    if (webcamStatusTx) webcamStatusTx.textContent = webcamEnabled ? 'On' : 'Off';
    if (getState() !== 'idle') {
      if (webcamEnabled) openWebcam();
      else closeWebcam();
    }
  });
  toggleWebcamEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWebcamEl.click(); }
  });

  // MP4 support check
  if (typeof MediaRecorder !== 'undefined' && formatSel) {
    const mp4Opt = formatSel.querySelector('option[value="mp4"]');
    if (mp4Opt && !mp4Supported) {
      mp4Opt.textContent = 'MP4 (unsupported)';
      mp4Opt.disabled = true;
    }
  }
}
