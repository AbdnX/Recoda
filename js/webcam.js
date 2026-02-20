/**
 * Webcam PiP overlay with drag support.
 * DOM elements are resolved lazily to avoid crashes when elements don't exist.
 */

import { $ } from './utils.js';
import { showToast } from './toast.js';

let webcamStream = null;

/** Get DOM elements lazily */
function getElements() {
  return {
    webcamPip: $('webcam-pip'),
    webcamVideo: $('webcam-video'),
    parent: $('preview-monitor'),
  };
}

/** Open the webcam and show PiP overlay */
export async function openWebcam() {
  const { webcamPip, webcamVideo } = getElements();
  if (!webcamPip || !webcamVideo) return;

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
    });
    webcamVideo.srcObject = webcamStream;
    webcamPip.classList.add('visible');
  } catch (e) {
    showToast('Webcam not available.', 'info');
  }
}

/** Close the webcam and hide PiP */
export function closeWebcam() {
  const { webcamPip, webcamVideo } = getElements();

  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
  if (webcamVideo) webcamVideo.srcObject = null;
  if (webcamPip) webcamPip.classList.remove('visible');
}

/** Get the raw webcam stream (for cleanup) */
export function getWebcamStream() {
  return webcamStream;
}

/** Initialize draggable behaviour for the PiP element */
export function initWebcamDrag() {
  const { webcamPip, parent } = getElements();
  if (!webcamPip || !parent) return;

  let drag = false, sx, sy, sl, st;

  webcamPip.addEventListener('mousedown', (e) => {
    drag = true;
    webcamPip.style.cursor = 'grabbing';
    const r = webcamPip.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    sx = e.clientX;
    sy = e.clientY;
    sl = r.left - p.left;
    st = r.top - p.top;
    webcamPip.style.right = 'auto';
    webcamPip.style.bottom = 'auto';
    webcamPip.style.left = sl + 'px';
    webcamPip.style.top = st + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    webcamPip.style.left = (sl + e.clientX - sx) + 'px';
    webcamPip.style.top = (st + e.clientY - sy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (drag) {
      drag = false;
      webcamPip.style.cursor = 'grab';
    }
  });
}
