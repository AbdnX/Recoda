/**
 * Segmented VU meter rendering and animation loop.
 */

import { $ } from './utils.js';

const SEGMENTS = 24;

// DOM refs
const metersSection = $('meters-section');
const meterMicRow   = $('meter-mic-row');
const meterSysRow   = $('meter-sys-row');
const meterMicTrack = $('meter-mic-track');
const meterSysTrack = $('meter-sys-track');
const meterMicDb    = $('meter-mic-db');
const meterSysDb    = $('meter-sys-db');

let micAnalyser = null;
let sysAnalyser = null;
let vuFrame = null;

/** Build meter segment divs inside a track element */
export function buildSegments(track) {
  track.innerHTML = '';
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'meter-seg';
    track.appendChild(seg);
  }
}

/** Read the average level from an AnalyserNode (0–1) */
function readLevel(analyser) {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return (sum / data.length) / 255;
}

/** Update the visual segments and dB readout for one meter */
function updateMeterUI(track, dbEl, level) {
  const segs = track.children;
  const lit = Math.round(level * SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = segs[i];
    seg.className = 'meter-seg';
    if (i < lit) {
      const pct = i / SEGMENTS;
      if (pct < 0.6) seg.classList.add('lit-green');
      else if (pct < 0.85) seg.classList.add('lit-yellow');
      else seg.classList.add('lit-red');
    }
  }
  const db = level > 0 ? Math.round(20 * Math.log10(level)) : -60;
  dbEl.textContent = db > -60 ? `${db}dB` : '—';
}

/** rAF loop to animate meters */
function animateLoop() {
  if (micAnalyser) updateMeterUI(meterMicTrack, meterMicDb, readLevel(micAnalyser));
  if (sysAnalyser) updateMeterUI(meterSysTrack, meterSysDb, readLevel(sysAnalyser));
  vuFrame = requestAnimationFrame(animateLoop);
}

/**
 * Show and start animating meters.
 * @param {AnalyserNode|null} mic
 * @param {AnalyserNode|null} sys
 */
export function startMeters(mic, sys) {
  micAnalyser = mic;
  sysAnalyser = sys;
  if (mic) meterMicRow.style.display = '';
  if (sys) meterSysRow.style.display = '';
  if (mic || sys) metersSection.classList.add('visible');
  animateLoop();
}

/** Stop animation and reset meters to idle */
export function stopMeters() {
  cancelAnimationFrame(vuFrame);
  for (const s of meterMicTrack.children) s.className = 'meter-seg';
  for (const s of meterSysTrack.children) s.className = 'meter-seg';
  meterMicDb.textContent = '—';
  meterSysDb.textContent = '—';
  metersSection.classList.remove('visible');
  meterMicRow.style.display = 'none';
  meterSysRow.style.display = 'none';
  micAnalyser = null;
  sysAnalyser = null;
}

/** One-time initialization: build segment divs */
export function initMeters() {
  buildSegments(meterMicTrack);
  buildSegments(meterSysTrack);
}
