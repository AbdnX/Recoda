/**
 * Webcam PiP overlay.
 * The in-page widget is position:fixed at body level (drag anywhere).
 * The float button triggers the browser's native Picture-in-Picture API
 * so the camera follows the user across all tabs and windows.
 */

import { $ } from './utils.js';
import { showToast } from './toast.js';

let webcamStream = null;

/** Open the webcam, show the in-page PiP, and try to auto-enter browser PiP */
export async function openWebcam() {
  const webcamPip   = $('webcam-pip');
  const webcamVideo = $('webcam-video');
  if (!webcamPip || !webcamVideo) return;

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
    });
    webcamVideo.srcObject = webcamStream;
    await webcamVideo.play().catch(() => {});
    webcamPip.classList.add('visible');

    // Auto-enter browser PiP so camera floats across all tabs.
    // This works best when called right after a user gesture (e.g. right after
    // the getDisplayMedia screen-picker dialog resolves).
    if (document.pictureInPictureEnabled) {
      try {
        await webcamVideo.requestPictureInPicture();
        // pip-active class is set via the 'enterpictureinpicture' listener below
      } catch {
        // User gesture too stale — user can click the ⊞ button to float manually
      }
    }
  } catch {
    showToast('Webcam not available.', 'info');
  }
}

/** Stop the webcam stream, exit browser PiP, and hide the widget */
export function closeWebcam() {
  const webcamPip   = $('webcam-pip');
  const webcamVideo = $('webcam-video');

  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
  if (webcamVideo) webcamVideo.srcObject = null;
  if (webcamPip) {
    webcamPip.classList.remove('visible', 'pip-active');
    // Reset to default bottom-right position for next session
    webcamPip.style.left = webcamPip.style.top = webcamPip.style.right = webcamPip.style.bottom = '';
  }
}

/** Get the raw webcam stream (used by recorder cleanup) */
export function getWebcamStream() {
  return webcamStream;
}

/** Initialise dragging and the float button. Called once at app startup. */
export function initWebcamDrag() {
  const webcamPip   = $('webcam-pip');
  const webcamVideo = $('webcam-video');
  const floatBtn    = $('btn-webcam-float');
  if (!webcamPip) return;

  // ── Float button: toggle browser Picture-in-Picture ──────────
  if (floatBtn && webcamVideo) {
    floatBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent drag starting

      if (document.pictureInPictureElement === webcamVideo) {
        await document.exitPictureInPicture().catch(() => {});
      } else if (document.pictureInPictureEnabled) {
        try {
          await webcamVideo.requestPictureInPicture();
        } catch {
          showToast('Could not float camera — try clicking again.', 'info');
        }
      }
    });

    // Keep pip-active in sync with browser PiP state
    webcamVideo.addEventListener('enterpictureinpicture', () => {
      webcamPip.classList.add('pip-active');
    });
    webcamVideo.addEventListener('leavepictureinpicture', () => {
      webcamPip.classList.remove('pip-active');
    });
  }

  // ── Drag: move the in-page widget anywhere on screen ─────────
  let dragging = false;
  let startMouseX, startMouseY, startLeft, startTop;

  function beginDrag(clientX, clientY) {
    dragging = true;
    const r = webcamPip.getBoundingClientRect();
    startMouseX = clientX;
    startMouseY = clientY;
    startLeft   = r.left;
    startTop    = r.top;
    // Switch from CSS right/bottom anchoring to left/top for free movement
    webcamPip.style.right  = 'auto';
    webcamPip.style.bottom = 'auto';
    webcamPip.style.left   = startLeft + 'px';
    webcamPip.style.top    = startTop  + 'px';
  }

  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    const w = webcamPip.offsetWidth;
    const h = webcamPip.offsetHeight;
    webcamPip.style.left = Math.max(0, Math.min(window.innerWidth  - w, startLeft + (clientX - startMouseX))) + 'px';
    webcamPip.style.top  = Math.max(0, Math.min(window.innerHeight - h, startTop  + (clientY - startMouseY))) + 'px';
  }

  webcamPip.addEventListener('mousedown', (e) => {
    if (floatBtn?.contains(e.target)) return;
    beginDrag(e.clientX, e.clientY);
    e.preventDefault();
  });
  document.addEventListener('mousemove',  (e) => moveDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup',    ()  => { dragging = false; });

  // Touch
  webcamPip.addEventListener('touchstart', (e) => {
    if (floatBtn?.contains(e.target)) return;
    beginDrag(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    if (dragging) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', () => { dragging = false; });
}
