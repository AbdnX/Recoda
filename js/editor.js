/**
 * Rich Video Editor — FFmpeg.wasm powered
 * Text overlays, drawing annotations, speed control, color filters.
 */

import { $ } from './utils.js';
import { showToast } from './toast.js';
import { saveRecording } from './storage.js';
import { addRecording } from './recordings.js';

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  rec: null,           // source recording object
  blobUrl: null,       // object URL for editor video
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  speed: 1,
  filters: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
  textOverlays: [],    // { id, text, x, y, size, color, tStart, tEnd }
  annotations: [],     // { paths: [{x,y}], color, width, opacity, time }
  activeTool: 'trim',
  // Draw state
  isDrawing: false,
  currentPath: null,
  drawColor: '#ff3040',
  drawWidth: 4,
  drawOpacity: 1,
};

let ffmpegInstance = null;
let ffmpegLoaded = false;
let textOverlayCounter = 0;

// ─── DOM refs (set in initEditor) ────────────────────────────────────────────

let editorModal, editorVideo, editorCanvas, editorCtx, editorTimeline;
let editorPlayBtn, editorTimeDisplay, editorFilename;
let editorProgressWrap, editorProgressFill, editorProgressLabel;
let editorExportBtn, editorCancelBtn;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initEditor() {
  editorModal       = $('editor-modal');
  editorVideo       = $('editor-video');
  editorCanvas      = $('editor-canvas');
  editorTimeline    = $('editor-timeline');
  editorPlayBtn     = $('editor-play-btn');
  editorTimeDisplay = $('editor-time-display');
  editorFilename    = $('editor-filename');
  editorProgressWrap  = $('editor-progress-wrap');
  editorProgressFill  = $('editor-progress-fill');
  editorProgressLabel = $('editor-progress-label');
  editorExportBtn   = $('editor-export-btn');
  editorCancelBtn   = $('editor-cancel-btn');

  if (!editorModal) return;

  editorCtx = editorCanvas.getContext('2d');

  // Close
  $('editor-modal-close').addEventListener('click', closeEditor);
  editorCancelBtn.addEventListener('click', closeEditor);
  editorModal.addEventListener('click', (e) => {
    if (e.target === editorModal) closeEditor();
  });

  // Toolbar
  document.querySelectorAll('.editor-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  // Video playback
  editorPlayBtn.addEventListener('click', togglePlay);
  editorVideo.addEventListener('timeupdate', onTimeUpdate);
  editorVideo.addEventListener('loadedmetadata', onMetadataLoaded);
  editorVideo.addEventListener('ended', () => updatePlayIcon(false));

  // Timeline scrubber
  editorTimeline.addEventListener('input', () => {
    editorVideo.currentTime = (editorTimeline.value / 100) * state.duration;
  });

  // Trim panel
  $('editor-trim-start').addEventListener('input', onTrimStartChange);
  $('editor-trim-end').addEventListener('input', onTrimEndChange);

  // Text panel
  $('editor-text-size').addEventListener('input', () => {
    $('editor-text-size-val').textContent = $('editor-text-size').value + 'px';
  });
  $('editor-text-add').addEventListener('click', addTextOverlayFromPanel);

  // Draw panel
  $('editor-draw-color').addEventListener('input', (e) => { state.drawColor = e.target.value; });
  $('editor-draw-width').addEventListener('input', (e) => {
    state.drawWidth = Number(e.target.value);
    $('editor-draw-width-val').textContent = state.drawWidth + 'px';
  });
  $('editor-draw-opacity').addEventListener('input', (e) => {
    state.drawOpacity = Number(e.target.value) / 100;
    $('editor-draw-opacity-val').textContent = e.target.value + '%';
  });
  $('editor-draw-clear').addEventListener('click', () => {
    state.annotations = [];
    clearCanvas();
    showToast('Annotations cleared', 'info', 1500);
  });

  // Canvas drawing events
  editorCanvas.addEventListener('mousedown', startDraw);
  editorCanvas.addEventListener('mousemove', draw);
  editorCanvas.addEventListener('mouseup', endDraw);
  editorCanvas.addEventListener('mouseleave', endDraw);

  // Speed panel
  $('editor-speed').addEventListener('input', (e) => {
    setSpeed(Number(e.target.value));
  });
  document.querySelectorAll('.speed-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = Number(btn.dataset.speed);
      $('editor-speed').value = s;
      setSpeed(s);
    });
  });

  // Filters panel
  ['brightness', 'contrast', 'saturation', 'gamma'].forEach((key) => {
    const el = $(`editor-filter-${key}`);
    if (!el) return;
    el.addEventListener('input', () => {
      updateFilters(key, Number(el.value));
    });
  });
  $('editor-filter-reset').addEventListener('click', resetFilters);

  // Export
  editorExportBtn.addEventListener('click', exportVideo);
}

// ─── Open / Close ─────────────────────────────────────────────────────────────

export function openEditor(rec) {
  state.rec = rec;
  state.textOverlays = [];
  state.annotations = [];
  state.activeTool = 'trim';
  state.speed = 1;
  state.filters = { brightness: 0, contrast: 1, saturation: 1, gamma: 1 };
  textOverlayCounter = 0;

  // Set up video
  if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
  const blob = rec.blob;
  state.blobUrl = blob ? URL.createObjectURL(blob) : rec.url;
  editorVideo.src = state.blobUrl;

  editorFilename.textContent = rec.filename || 'recording';

  // Reset panels & tool
  setActiveTool('trim');
  resetFiltersUI();
  updateSpeedUI(1);
  clearCanvas();
  $('editor-text-list').innerHTML = '';

  // Show modal
  editorModal.style.display = 'flex';
  editorModal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

export function closeEditor() {
  editorModal.style.display = 'none';
  editorModal.classList.remove('open');
  editorVideo.pause();
  editorVideo.src = '';
  if (state.blobUrl && state.rec?.blob) {
    URL.revokeObjectURL(state.blobUrl);
  }
  state.blobUrl = null;
  state.rec = null;
  clearCanvas();
  hideProgress();
}

// ─── Tool Switching ───────────────────────────────────────────────────────────

function setActiveTool(tool) {
  state.activeTool = tool;

  document.querySelectorAll('.editor-tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  document.querySelectorAll('.editor-panel').forEach((p) => {
    p.style.display = 'none';
  });
  const panel = $(`editor-panel-${tool}`);
  if (panel) panel.style.display = '';

  // Enable/disable canvas drawing
  if (tool === 'draw') {
    editorCanvas.classList.add('draw-active');
  } else {
    editorCanvas.classList.remove('draw-active');
  }
}

// ─── Video Playback ───────────────────────────────────────────────────────────

function togglePlay() {
  if (editorVideo.paused) {
    editorVideo.play();
    updatePlayIcon(true);
  } else {
    editorVideo.pause();
    updatePlayIcon(false);
  }
}

function updatePlayIcon(playing) {
  const icon = editorPlayBtn.querySelector('i[data-lucide]');
  if (!icon) return;
  icon.setAttribute('data-lucide', playing ? 'pause' : 'play');
  if (window.lucide) lucide.createIcons();
}

function onTimeUpdate() {
  const t = editorVideo.currentTime;
  const d = state.duration || 1;
  editorTimeline.value = (t / d) * 100;
  editorTimeDisplay.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
  renderCanvas();
}

function onMetadataLoaded() {
  state.duration = editorVideo.duration || 0;
  state.trimStart = 0;
  state.trimEnd = state.duration;
  initTrimPanel();
  resizeCanvas();
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function resizeCanvas() {
  const rect = editorVideo.getBoundingClientRect();
  editorCanvas.width  = rect.width  || editorVideo.videoWidth  || 1280;
  editorCanvas.height = rect.height || editorVideo.videoHeight || 720;
}

function clearCanvas() {
  if (!editorCtx) return;
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
}

function renderCanvas() {
  clearCanvas();
  const t = editorVideo.currentTime;
  renderAnnotations(t);
  renderTextOnCanvas(t);
}

// ─── Trim Panel ───────────────────────────────────────────────────────────────

function initTrimPanel() {
  const startEl = $('editor-trim-start');
  const endEl   = $('editor-trim-end');
  const d = state.duration;

  startEl.max = d;
  startEl.step = Math.max(0.01, d / 1000);
  startEl.value = 0;

  endEl.max = d;
  endEl.step = Math.max(0.01, d / 1000);
  endEl.value = d;

  $('editor-trim-start-val').textContent = fmtTime(0);
  $('editor-trim-end-val').textContent   = fmtTime(d);
  $('editor-trim-length').textContent    = fmtTime(d);
}

function onTrimStartChange() {
  const startEl = $('editor-trim-start');
  const endEl   = $('editor-trim-end');
  let s = Number(startEl.value);
  let e = Number(endEl.value);
  if (s >= e - 0.1) { s = Math.max(0, e - 0.1); startEl.value = s; }
  state.trimStart = s;
  $('editor-trim-start-val').textContent = fmtTime(s);
  $('editor-trim-length').textContent = fmtTime(e - s);
  editorVideo.currentTime = s;
}

function onTrimEndChange() {
  const startEl = $('editor-trim-start');
  const endEl   = $('editor-trim-end');
  let s = Number(startEl.value);
  let e = Number(endEl.value);
  if (e <= s + 0.1) { e = Math.min(state.duration, s + 0.1); endEl.value = e; }
  state.trimEnd = e;
  $('editor-trim-end-val').textContent = fmtTime(e);
  $('editor-trim-length').textContent = fmtTime(e - s);
}

// ─── Text Overlays ────────────────────────────────────────────────────────────

function addTextOverlayFromPanel() {
  const text   = $('editor-text-input').value.trim();
  if (!text) { showToast('Enter some text first', 'error', 2000); return; }
  const x      = Number($('editor-text-x').value) / 100;
  const y      = Number($('editor-text-y').value) / 100;
  const size   = Number($('editor-text-size').value);
  const color  = $('editor-text-color').value;
  const tStart = Number($('editor-text-tstart').value) || 0;
  const tEndRaw = $('editor-text-tend').value;
  const tEnd   = tEndRaw ? Number(tEndRaw) : null;

  addTextOverlay({ text, x, y, size, color, tStart, tEnd });
  $('editor-text-input').value = '';
}

export function addTextOverlay(opts) {
  const id = ++textOverlayCounter;
  state.textOverlays.push({ id, ...opts });
  renderTextList();
}

export function removeTextOverlay(id) {
  const idx = state.textOverlays.findIndex((o) => o.id === id);
  if (idx !== -1) state.textOverlays.splice(idx, 1);
  renderTextList();
}

function renderTextList() {
  const list = $('editor-text-list');
  list.innerHTML = '';
  state.textOverlays.forEach((o) => {
    const item = document.createElement('div');
    item.className = 'editor-overlay-item';
    item.innerHTML = `
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;">${escHtml(o.text)}</span>
      <button title="Remove" data-id="${o.id}">×</button>
    `;
    item.querySelector('button').addEventListener('click', () => removeTextOverlay(o.id));
    list.appendChild(item);
  });
}

function renderTextOnCanvas(t) {
  if (!editorCtx) return;
  state.textOverlays.forEach((o) => {
    const inRange = t >= o.tStart && (o.tEnd === null || t <= o.tEnd);
    if (!inRange) return;
    const cw = editorCanvas.width;
    const ch = editorCanvas.height;
    editorCtx.save();
    editorCtx.font = `bold ${o.size}px sans-serif`;
    editorCtx.fillStyle = o.color;
    editorCtx.strokeStyle = 'rgba(0,0,0,0.5)';
    editorCtx.lineWidth = 2;
    const x = o.x * cw;
    const y = o.y * ch;
    editorCtx.strokeText(o.text, x, y);
    editorCtx.fillText(o.text, x, y);
    editorCtx.restore();
  });
}

// ─── Drawing Annotations ──────────────────────────────────────────────────────

function getCanvasPos(e) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (editorCanvas.width / rect.width),
    y: (e.clientY - rect.top)  * (editorCanvas.height / rect.height),
  };
}

function startDraw(e) {
  if (state.activeTool !== 'draw') return;
  state.isDrawing = true;
  const pos = getCanvasPos(e);
  state.currentPath = {
    points: [pos],
    color: state.drawColor,
    width: state.drawWidth,
    opacity: state.drawOpacity,
    time: editorVideo.currentTime,
  };
}

function draw(e) {
  if (!state.isDrawing || !state.currentPath) return;
  const pos = getCanvasPos(e);
  state.currentPath.points.push(pos);
  // Live preview
  const pts = state.currentPath.points;
  const last = pts[pts.length - 2] || pts[0];
  editorCtx.save();
  editorCtx.globalAlpha = state.currentPath.opacity;
  editorCtx.strokeStyle = state.currentPath.color;
  editorCtx.lineWidth   = state.currentPath.width;
  editorCtx.lineCap     = 'round';
  editorCtx.lineJoin    = 'round';
  editorCtx.beginPath();
  editorCtx.moveTo(last.x, last.y);
  editorCtx.lineTo(pos.x, pos.y);
  editorCtx.stroke();
  editorCtx.restore();
}

function endDraw() {
  if (!state.isDrawing || !state.currentPath) return;
  state.isDrawing = false;
  if (state.currentPath.points.length > 1) {
    state.annotations.push(state.currentPath);
  }
  state.currentPath = null;
}

function renderAnnotations(t) {
  if (!editorCtx) return;
  state.annotations.forEach((ann) => {
    // Show annotations near their recorded time (±0.3s) or if no time filter
    const delta = Math.abs(ann.time - t);
    if (delta > 0.5) return;
    const pts = ann.points;
    if (pts.length < 2) return;
    editorCtx.save();
    editorCtx.globalAlpha = ann.opacity;
    editorCtx.strokeStyle = ann.color;
    editorCtx.lineWidth   = ann.width;
    editorCtx.lineCap     = 'round';
    editorCtx.lineJoin    = 'round';
    editorCtx.beginPath();
    editorCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) editorCtx.lineTo(pts[i].x, pts[i].y);
    editorCtx.stroke();
    editorCtx.restore();
  });
}

// ─── Speed ────────────────────────────────────────────────────────────────────

function setSpeed(value) {
  state.speed = value;
  editorVideo.playbackRate = value;
  updateSpeedUI(value);
}

function updateSpeedUI(value) {
  $('editor-speed-val').textContent = value.toFixed(2) + '×';
  $('editor-speed').value = value;
  document.querySelectorAll('.speed-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.speed) === value);
  });
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function updateFilters(key, val) {
  state.filters[key] = val;
  $(`editor-filter-${key}-val`).textContent =
    key === 'brightness' ? val.toFixed(2) : val.toFixed(2);
  updatePreviewFilters();
}

function updatePreviewFilters() {
  const { brightness, contrast, saturation, gamma } = state.filters;
  // CSS filter: brightness is 0-based offset → map to css brightness multiplier
  const cssBrightness = 1 + brightness;
  editorVideo.style.filter = [
    `brightness(${cssBrightness})`,
    `contrast(${contrast})`,
    `saturate(${saturation})`,
  ].join(' ');
}

function resetFilters() {
  state.filters = { brightness: 0, contrast: 1, saturation: 1, gamma: 1 };
  resetFiltersUI();
  updatePreviewFilters();
}

function resetFiltersUI() {
  $('editor-filter-brightness').value = 0;
  $('editor-filter-contrast').value   = 1;
  $('editor-filter-saturation').value = 1;
  $('editor-filter-gamma').value      = 1;
  $('editor-filter-brightness-val').textContent = '0';
  $('editor-filter-contrast-val').textContent   = '1.00';
  $('editor-filter-saturation-val').textContent = '1.00';
  $('editor-filter-gamma-val').textContent      = '1.00';
  editorVideo.style.filter = '';
}

// ─── FFmpeg Export ────────────────────────────────────────────────────────────

async function loadFFmpeg() {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  setProgress(5, 'Loading FFmpeg…');

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  // Must match installed @ffmpeg/core version in package.json
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

  const ff = new FFmpeg();
  ff.on('progress', ({ progress }) => {
    setProgress(10 + Math.round(progress * 80), 'Encoding…');
  });

  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = { ff, fetchFile };
  ffmpegLoaded   = true;
  return ffmpegInstance;
}

/**
 * Build FFmpeg filter_complex string.
 * overlayCount = number of PNG overlay inputs (indices 1..overlayCount).
 * hasAudio = whether to include audio filter.
 */
function buildFilterChain(overlayCount, hasAudio) {
  const s   = state.trimStart;
  const e   = state.trimEnd;
  const spd = state.speed;
  const { brightness, contrast, saturation } = state.filters;

  const parts = [];

  // ── Video chain ──────────────────────────────────────────────────
  let vChain = `[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=PTS-STARTPTS`;
  if (spd !== 1) vChain += `,setpts=PTS/${spd.toFixed(6)}`;
  // Only apply eq when something is actually changed
  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    vChain += `,eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`;
  }

  if (overlayCount === 0) {
    parts.push(`${vChain}[vout]`);
  } else {
    // Label the base video chain output, then chain overlays
    parts.push(`${vChain}[vbase]`);
    for (let i = 0; i < overlayCount; i++) {
      const inLabel  = i === 0 ? 'vbase' : `vov${i - 1}`;
      const outLabel = i === overlayCount - 1 ? 'vout' : `vov${i}`;
      parts.push(`[${inLabel}][${i + 1}:v]overlay=0:0:format=auto[${outLabel}]`);
    }
  }

  // ── Audio chain ──────────────────────────────────────────────────
  if (hasAudio) {
    const atempoFilters = buildAtempoChain(spd);
    parts.push(
      `[0:a]atrim=start=${s.toFixed(3)}:end=${e.toFixed(3)},asetpts=PTS-STARTPTS${atempoFilters}[aout]`
    );
  }

  return parts.join(';');
}

function buildAtempoChain(speed) {
  if (speed === 1) return '';
  // atempo accepts 0.5–2.0; chain for extremes
  const filters = [];
  let remaining = speed;
  if (remaining > 2) {
    while (remaining > 2) {
      filters.push(',atempo=2.0');
      remaining /= 2;
    }
    filters.push(`,atempo=${remaining.toFixed(4)}`);
  } else if (remaining < 0.5) {
    while (remaining < 0.5) {
      filters.push(',atempo=0.5');
      remaining /= 0.5;
    }
    filters.push(`,atempo=${remaining.toFixed(4)}`);
  } else {
    filters.push(`,atempo=${remaining.toFixed(4)}`);
  }
  return filters.join('');
}

/**
 * Render all drawing annotations AND text overlays to PNG files in FFmpeg FS.
 * Returns array of { fname } in the order they'll be used as overlay inputs.
 */
async function renderOverlaysToFiles(ff, fetchFile) {
  const vw = editorVideo.videoWidth  || 1280;
  const vh = editorVideo.videoHeight || 720;
  const scaleX = vw / (editorCanvas.width  || vw);
  const scaleY = vh / (editorCanvas.height || vh);
  const written = [];
  let idx = 0;

  // Drawing annotations — one PNG per stroke
  for (const ann of state.annotations) {
    const pts = ann.points;
    if (pts.length < 2) continue;
    const oc  = new OffscreenCanvas(vw, vh);
    const ctx = oc.getContext('2d');
    ctx.globalAlpha = ann.opacity;
    ctx.strokeStyle = ann.color;
    ctx.lineWidth   = ann.width * scaleX;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x * scaleX, pts[j].y * scaleY);
    ctx.stroke();
    const blob  = await oc.convertToBlob({ type: 'image/png' });
    const fname = `overlay_${idx++}.png`;
    await ff.writeFile(fname, await fetchFile(blob));
    written.push({ fname });
  }

  // Text overlays — one PNG per text item (avoids drawtext font dependency)
  for (const o of state.textOverlays) {
    const oc  = new OffscreenCanvas(vw, vh);
    const ctx = oc.getContext('2d');
    const x   = o.x * vw;
    const y   = o.y * vh;
    const fs  = o.size * scaleX;
    ctx.font        = `bold ${fs}px sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = Math.max(2, fs * 0.06);
    ctx.fillStyle   = o.color;
    ctx.strokeText(o.text, x, y);
    ctx.fillText(o.text, x, y);
    const blob  = await oc.convertToBlob({ type: 'image/png' });
    const fname = `overlay_${idx++}.png`;
    await ff.writeFile(fname, await fetchFile(blob));
    written.push({ fname });
  }

  return written;
}

export async function exportVideo() {
  if (!state.rec) return;

  editorExportBtn.disabled = true;
  showProgress();
  setProgress(2, 'Preparing…');

  try {
    const { ff, fetchFile } = await loadFFmpeg();

    setProgress(8, 'Reading source file…');
    const srcBlob = state.rec.blob || await fetch(state.rec.url).then((r) => r.blob());
    await ff.writeFile('input.webm', await fetchFile(srcBlob));

    setProgress(12, 'Rendering overlays…');
    const overlayFiles = await renderOverlaysToFiles(ff, fetchFile);
    const overlayCount = overlayFiles.length;

    // Try with audio first; if that fails (no audio stream), retry without
    let encodeSuccess = false;
    for (const hasAudio of [true, false]) {
      try {
        setProgress(15, hasAudio ? 'Encoding…' : 'Encoding (no audio track)…');

        const filterComplex = buildFilterChain(overlayCount, hasAudio);
        const args = ['-i', 'input.webm'];
        overlayFiles.forEach(({ fname }) => args.push('-i', fname));
        args.push('-filter_complex', filterComplex);
        args.push('-map', '[vout]');
        if (hasAudio) args.push('-map', '[aout]');
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22');
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');
        args.push('-movflags', '+faststart');
        args.push('output.mp4');

        await ff.exec(args);
        encodeSuccess = true;
        break;
      } catch (encErr) {
        if (!hasAudio) throw encErr; // both attempts failed — surface error
        console.warn('Export with audio failed, retrying without:', encErr);
        try { await ff.deleteFile('output.mp4'); } catch (_) {}
      }
    }

    if (!encodeSuccess) throw new Error('Encoding failed');

    setProgress(92, 'Saving…');
    const data   = await ff.readFile('output.mp4');
    const outBlob = new Blob([data.buffer], { type: 'video/mp4' });

    // Cleanup FS
    try {
      await ff.deleteFile('input.webm');
      await ff.deleteFile('output.mp4');
      for (const { fname } of overlayFiles) await ff.deleteFile(fname);
    } catch (_) {}

    const origName = (state.rec.filename || 'recording').replace(/\.[^.]+$/, '');
    const newRec = {
      filename: `${origName}_edited.mp4`,
      blob:     outBlob,
      size:     outBlob.size,
      duration: state.trimEnd - state.trimStart,
      mimeType: 'video/mp4',
      ts:       new Date(),
      synced:   false,
    };

    setProgress(98, 'Storing…');
    await addRecording(newRec);

    setProgress(100, 'Done!');
    showToast('Exported successfully — saved to library', 'success', 3000);
    setTimeout(closeEditor, 800);
  } catch (err) {
    console.error('Export failed:', err);
    showToast(`Export failed: ${err.message}`, 'error', 5000);
    hideProgress();
    editorExportBtn.disabled = false;
  }
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

function showProgress() {
  if (editorProgressWrap) editorProgressWrap.style.display = 'flex';
}
function hideProgress() {
  if (editorProgressWrap) editorProgressWrap.style.display = 'none';
  setProgress(0, '');
}
function setProgress(pct, label) {
  if (editorProgressFill)  editorProgressFill.style.width  = pct + '%';
  if (editorProgressLabel) editorProgressLabel.textContent = label;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtTime(secs) {
  if (!isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
