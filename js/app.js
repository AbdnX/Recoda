/**
 * Application Entry Point
 * Orchestrates initialization of all modules.
 */

import { initRouter } from './router.js';
import { initAuth } from './auth.js';
import { initUI } from './ui.js';
import { initSettings } from './settings.js';
import { initRecordings } from './recordings.js';
import { initCloud } from './cloud.js';
import { initWebcamDrag } from './webcam.js';
import { initMeters } from './meters.js';
import { initRecorder } from './recorder.js';
import { initKeyboardShortcuts } from './keyboard.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize in order
  initUI();
  initSettings();
  initWebcamDrag();
  initMeters(); // Initialize canvas/context
  initRecorder();
  initKeyboardShortcuts();
  
  // Auth & Cloud (async)
  await initAuth();
  await initRecordings();
  await initCloud();
  
  // Router last to handle deep links/navigation state
  initRouter();

  // Expose for debugging if needed
  window.Recoda = { version: '1.0.0' };
});
