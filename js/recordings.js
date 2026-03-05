/**
 * Session recordings list: add, render, play, download with format chooser.
 * Persists recordings to IndexedDB so they survive page refreshes.
 * Renders into the Library page.
 */

import { $ } from './utils.js';
import { formatTime, formatSize, escapeHtml } from './utils.js';
import { showToast } from './toast.js';
import { saveRecording, loadAllRecordings, deleteRecording as dbDelete, updateRecording as dbUpdate } from './storage.js';
import { getSupabase } from './supabase.js';
import { updateSyncButton } from './cloud.js';
import { openEditor } from './editor.js';

const recordings = [];
let dlTarget = null;        // recording object currently in the modal
let dlSelectedFmt = 'mp4';  // selected download format
let lastViewedRecording = null;  // track which recording is in the preview
let trimTarget = null;      // recording object currently in trim modal
let trimPreviewUrl = null;  // object URL for trim preview video
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

/** Get the recording currently loaded in the preview */
export function getPreviewRecording() {
  return lastViewedRecording;
}

/** Set the recording currently loaded in the preview */
export function setPreviewRecording(rec) {
  lastViewedRecording = rec;
}

/**
 * Add a new recording to the session list and persist to IndexedDB.
 */
export async function addRecording(rec) {
  try {
    const id = await saveRecording(rec);
    rec.id = id;
  } catch (err) {
    console.error('Failed to persist recording:', err);
    showToast('Warning: recording not saved to local storage', 'error', 3000);
  }
  recordings.unshift(rec);
  renderRecordings();
}

/** Get all recordings array */
export function getAllRecordings() {
  return recordings;
}

/** Mark an in-memory recording as synced and refresh UI */
export function markRecordingSynced(recordId, filename) {
  const rec = recordings.find((r) => (recordId != null && r.id === recordId) || (filename && r.filename === filename));
  if (!rec) return;
  rec.synced = true;
  renderRecordings();
}

/** Upsert an in-memory recording and refresh UI */
export function upsertRecording(rec) {
  const idx = recordings.findIndex((r) => r.filename === rec.filename);
  if (idx === -1) {
    recordings.push(rec);
  } else {
    recordings[idx] = { ...recordings[idx], ...rec };
  }
  recordings.sort((a, b) => b.ts - a.ts);
  renderRecordings();
}

/** Get total recordings count */
export function getRecordingsCount() {
  return recordings.length;
}

/** Get the native format of a recording */
function getNativeFormat(rec) {
  return rec.mime.includes('mp4') ? 'mp4' : 'webm';
}

function extensionFromMime(mime) {
  return mime && mime.includes('mp4') ? 'mp4' : 'webm';
}

function getTrimSelection() {
  const startInput = $('trim-range-start');
  const endInput = $('trim-range-end');
  return {
    start: startInput ? Number(startInput.value) : 0,
    end: endInput ? Number(endInput.value) : 0
  };
}

function updateTrimLabels() {
  const startInput = $('trim-range-start');
  const endInput = $('trim-range-end');
  const startVal = $('trim-start-val');
  const endVal = $('trim-end-val');
  const lengthVal = $('trim-length-val');
  if (!startInput || !endInput || !startVal || !endVal || !lengthVal) return;

  const start = Number(startInput.value);
  const end = Number(endInput.value);
  startVal.textContent = formatTime(Math.max(0, Math.floor(start)));
  endVal.textContent = formatTime(Math.max(0, Math.floor(end)));
  lengthVal.textContent = formatTime(Math.max(1, Math.floor(end - start)));
}

function normalizeTrimRange(changed = 'start') {
  const startInput = $('trim-range-start');
  const endInput = $('trim-range-end');
  if (!startInput || !endInput) return;

  const minGap = 1;
  const startMax = Number(startInput.max || 0);
  const endMax = Number(endInput.max || 1);
  let start = Number(startInput.value);
  let end = Number(endInput.value);

  if (start >= end) {
    if (changed === 'start') {
      end = Math.min(endMax, start + minGap);
      if (end - start < minGap) start = Math.max(0, end - minGap);
    } else {
      start = Math.max(0, end - minGap);
      if (end - start < minGap) end = Math.min(endMax, start + minGap);
    }
  }

  start = Math.min(Math.max(0, start), startMax);
  end = Math.min(Math.max(1, end), endMax);

  startInput.value = String(start);
  endInput.value = String(end);
  updateTrimLabels();
}

function closeTrimModal() {
  const trimModal = $('trim-modal');
  const trimPreview = $('trim-preview-video');
  const trimApply = $('trim-apply');

  if (trimPreview) {
    trimPreview.pause();
    trimPreview.ontimeupdate = null;
    trimPreview.src = '';
    trimPreview.load();
  }
  if (trimPreviewUrl) {
    URL.revokeObjectURL(trimPreviewUrl);
    trimPreviewUrl = null;
  }
  if (trimModal) trimModal.classList.remove('open');
  if (trimApply) trimApply.disabled = false;
  trimTarget = null;
}

function waitForVideoEvent(video, eventName) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`Video ${eventName} failed`));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener(eventName, onOk, { once: true });
    video.addEventListener('error', onErr, { once: true });
  });
}

async function ensureRecordingBlob(rec) {
  if (rec.blob instanceof Blob) return rec.blob;
  if (!rec.isLocalServer) return null;

  const sb = await getSupabase();
  if (!sb) return null;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const authUrl = `${API_BASE}/api/local/file/${encodeURIComponent(rec.filename)}`;
  const res = await fetch(authUrl, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  if (!res.ok) return null;

  const blob = await res.blob();
  rec.blob = blob;
  rec.size = blob.size;
  rec.mime = blob.type || rec.mime;
  return blob;
}

async function openTrimModal(rec) {
  if (rec.isLocalServer && rec.id == null) {
    showToast('Trim is available for browser-saved clips in this build', 'info');
    return;
  }

  const trimModal = $('trim-modal');
  const trimPreview = $('trim-preview-video');
  const startInput = $('trim-range-start');
  const endInput = $('trim-range-end');
  const trimFileName = $('trim-file-name');
  const trimApply = $('trim-apply');
  if (!trimModal || !trimPreview || !startInput || !endInput) return;

  trimApply.disabled = true;
  trimTarget = rec;

  const blob = await ensureRecordingBlob(rec);
  if (!blob) {
    showToast('Unable to load recording for trim', 'error');
    trimTarget = null;
    trimApply.disabled = false;
    return;
  }

  if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
  trimPreviewUrl = URL.createObjectURL(blob);
  trimPreview.src = trimPreviewUrl;
  trimPreview.load();

  try {
    await waitForVideoEvent(trimPreview, 'loadedmetadata');
  } catch (_err) {
    showToast('Failed to prepare trim preview', 'error');
    closeTrimModal();
    return;
  }

  const totalSecs = Math.max(1, Math.floor(trimPreview.duration || rec.duration || 1));
  const maxStart = Math.max(0, totalSecs - 1);
  startInput.min = '0';
  startInput.max = String(maxStart);
  startInput.step = '1';
  startInput.value = '0';
  endInput.min = '1';
  endInput.max = String(totalSecs);
  endInput.step = '1';
  endInput.value = String(totalSecs);

  if (trimFileName) trimFileName.textContent = rec.filename;
  normalizeTrimRange();

  trimModal.classList.add('open');
  trimApply.disabled = false;
}

async function trimBlob(rec, startSec, endSec) {
  if (!window.MediaRecorder) {
    throw new Error('Trim is not supported in this browser');
  }
  const sourceBlob = await ensureRecordingBlob(rec);
  if (!sourceBlob) {
    throw new Error('Recording data unavailable');
  }

  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  await waitForVideoEvent(video, 'loadedmetadata');

  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : Math.max(1, rec.duration || 1);
  const safeStart = Math.min(Math.max(0, startSec), Math.max(0, duration - 0.1));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(endSec, duration));

  video.currentTime = safeStart;
  await waitForVideoEvent(video, 'seeked');

  const stream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
  if (!stream) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error('Video stream capture not supported');
  }

  const mimeCandidates = [rec.mime, 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .filter(Boolean);
  const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = () => reject(recorder.error || new Error('Trim export failed'));
  });

  const stopAt = safeEnd;
  const onTick = () => {
    if (video.currentTime >= stopAt && recorder.state !== 'inactive') {
      video.pause();
      recorder.stop();
    }
  };
  video.addEventListener('timeupdate', onTick);

  recorder.start(200);
  await video.play();
  const safetyTimer = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, Math.max(2000, (stopAt - safeStart) * 1800));

  await stopped;
  clearTimeout(safetyTimer);
  video.removeEventListener('timeupdate', onTick);
  URL.revokeObjectURL(sourceUrl);

  const outputType = recorder.mimeType || sourceBlob.type || 'video/webm';
  const trimmed = new Blob(chunks, { type: outputType });
  if (!trimmed.size) throw new Error('Trim produced an empty file');
  return {
    blob: trimmed,
    duration: Math.max(1, Math.round(stopAt - safeStart))
  };
}

async function applyTrim() {
  if (!trimTarget) return;
  const trimApply = $('trim-apply');
  const playerVideo = $('player-video');
  const playerFileName = $('player-filename');
  const playerDur = $('player-duration-val');
  const playerSize = $('player-size-val');
  const { start, end } = getTrimSelection();

  if (trimApply) trimApply.disabled = true;
  showToast('Trimming recording...', 'info', 0);

  try {
    const result = await trimBlob(trimTarget, start, end);

    if (trimTarget.url) URL.revokeObjectURL(trimTarget.url);
    trimTarget.blob = result.blob;
    trimTarget.url = URL.createObjectURL(result.blob);
    trimTarget.duration = result.duration;
    trimTarget.size = result.blob.size;
    trimTarget.mime = result.blob.type || trimTarget.mime;
    trimTarget.synced = false;
    trimTarget.ts = new Date();
    trimTarget.filename = `${trimTarget.filename.replace(/\.\w+$/, '')}.${extensionFromMime(trimTarget.mime)}`;

    if (trimTarget.id != null) {
      await dbUpdate(trimTarget.id, trimTarget);
    }

    if (lastViewedRecording === trimTarget && playerVideo) {
      playerVideo.pause();
      playerVideo.src = trimTarget.url;
      playerVideo.load();
      if (playerFileName) playerFileName.textContent = trimTarget.filename;
      if (playerDur) playerDur.textContent = formatTime(trimTarget.duration);
      if (playerSize) playerSize.textContent = formatSize(trimTarget.size);
    }

    recordings.sort((a, b) => b.ts - a.ts);
    renderRecordings();
    closeTrimModal();
    showToast('Trim complete', 'success', 2200);
  } catch (err) {
    console.error('Trim failed:', err);
    showToast(err.message || 'Trim failed', 'error', 3000);
    if (trimApply) trimApply.disabled = false;
  }
}

// ─── Download ──────────────────────────────────────────────

/** Trigger a file download using the File System Access API (Save As dialog) */
async function downloadFile(blob, filename, mimeType) {
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: ext === 'mp4' ? 'MP4 Video' : 'WebM Video',
          accept: { [mimeType]: [`.${ext}`] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }

  // Fallback: anchor download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return true;
}

/** Open the download format-chooser modal for a recording */
export function openDownloadModal(rec) {
  dlTarget = rec;
  const dlModal = $('dl-modal');
  const dlFileName = $('dl-file-name');
  const dlFileMeta = $('dl-file-meta');
  const dlFmtMp4 = $('dl-fmt-mp4');
  const dlFmtWebm = $('dl-fmt-webm');
  const dlNote = $('dl-compat-note');

  if (!dlModal) return;
  // Reset any old state
  dlModal.classList.remove('open');

  const native = getNativeFormat(rec);
  if (dlFileName) dlFileName.textContent = rec.filename;
  if (dlFileMeta) {
    dlFileMeta.textContent = `${formatTime(rec.duration)}  ·  ${formatSize(rec.blob ? rec.blob.size : rec.size)}  ·  ${native.toUpperCase()}`;
  }

  const canMp4  = native === 'mp4';
  const canWebm = native === 'webm';

  if (dlFmtMp4) {
    dlFmtMp4.classList.toggle('disabled', !canMp4);
    dlFmtMp4.querySelector('.dl-format-hint').textContent = canMp4
      ? 'Best compatibility — macOS, Windows, iOS'
      : 'Set format to MP4 in Settings before recording';
  }

  if (dlFmtWebm) {
    dlFmtWebm.classList.toggle('disabled', !canWebm);
    dlFmtWebm.querySelector('.dl-format-hint').textContent = canWebm
      ? 'Great for web — Chrome, Firefox, VLC'
      : 'Set format to WebM in Settings before recording';
  }

  selectFormat(native);

  if (dlNote) {
    if (native === 'webm') {
      dlNote.textContent = 'WebM may not open in QuickTime on macOS. Use VLC or set format to MP4 in Settings.';
    } else {
      dlNote.textContent = 'MP4 files play natively on macOS, Windows, and iOS.';
    }
  }

  dlModal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

/** Close the download modal */
function closeDownloadModal() {
  const dlModal = $('dl-modal');
  if (dlModal) dlModal.classList.remove('open');
  dlTarget = null;
}

/** Set the selected format in the modal */
function selectFormat(fmt) {
  const dlFmtMp4 = $('dl-fmt-mp4');
  const dlFmtWebm = $('dl-fmt-webm');
  dlSelectedFmt = fmt;
  if (dlFmtMp4) dlFmtMp4.classList.toggle('active', fmt === 'mp4');
  if (dlFmtWebm) dlFmtWebm.classList.toggle('active', fmt === 'webm');
}

/** Execute the download with the selected format */
async function executeDownload() {
  if (!dlTarget) return;

  const ext = dlSelectedFmt;
  const baseName = dlTarget.filename.replace(/\.\w+$/, '');
  const filename = `${baseName}.${ext}`;

  const mimeType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
  const freshBlob = new Blob([dlTarget.blob], { type: mimeType });

  const saved = await downloadFile(freshBlob, filename, mimeType);
  if (saved) {
    showToast(`Saved ${filename}`, 'success', 2000);
    closeDownloadModal();
  }
}

// ─── Local Save ───────────────────────────────────────────

/** Save a recording to the local library on the server */
async function saveRecordingToLocal(rec) {
  try {
    const sb = await getSupabase();
    if (!sb) {
      showToast('API not configured', 'error');
      return;
    }

    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showToast('Please log in to save to local library', 'warning');
      return;
    }

    showToast('Saving to local library...', 'info', 0);

    const formData = new FormData();
    formData.append('file', rec.blob, rec.filename);
    formData.append('filename', rec.filename);
    formData.append('duration', rec.duration);
    formData.append('mime', rec.mime);
    formData.append('ts', rec.ts.toISOString());

    const res = await fetch(`${API_BASE}/api/local/save`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save locally');
    }

    const data = await res.json();
    showToast(`Successfully saved to local library!`, 'success', 3000);
    return data;
  } catch (err) {
    console.error('Local save error:', err);
    showToast(err.message, 'error');
  }
}

/** Fetch recordings metadata from the local companion server */
export async function fetchLocalRecordings() {
  try {
    const sb = await getSupabase();
    if (!sb) return [];

    const { data: { session } } = await sb.auth.getSession();
    if (!session) return [];

    const res = await fetch(`${API_BASE}/api/local/recordings`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!res.ok) return [];

    const serverRecs = await res.json();
    return serverRecs.map(r => ({
      ...r,
      ts: new Date(r.ts),
      isLocalServer: true
    }));
  } catch (err) {
    console.error('Failed to fetch local server recordings:', err);
    return [];
  }
}

// ─── Delete ────────────────────────────────────────────────

/** Delete a recording by index */
async function removeRecording(index) {
  const rec = recordings[index];
  if (!rec) return;

  if (rec.id != null) {
    try {
      await dbDelete(rec.id);
    } catch (err) {
      console.error('Failed to delete from storage:', err);
    }
  }

  if (rec.url) URL.revokeObjectURL(rec.url);
  recordings.splice(index, 1);
  renderRecordings();
  showToast('Recording deleted', 'info', 2000);
}

// ─── Render ────────────────────────────────────────────────

/** Render the full recordings list */
export function renderRecordings() {
  const recList  = $('rec-list');
  const recCount = $('rec-count');
  const recEmpty = $('library-empty');
  const libraryCount = $('library-count');

  if (!recList) return;

  const count = recordings.length;
  const countLabel = `${count} file${count !== 1 ? 's' : ''}`;
  if (recCount) recCount.textContent = countLabel;
  if (libraryCount) libraryCount.textContent = countLabel;

  recList.querySelectorAll('.rec-row').forEach((el) => el.remove());

  if (count === 0) {
    if (recEmpty) recEmpty.style.display = '';
    return;
  }
  if (recEmpty) recEmpty.style.display = 'none';

  recordings.forEach((r, i) => {
    const fmt = getNativeFormat(r);
    const safeName = escapeHtml(r.filename);
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.innerHTML = `
      <div class="rec-info">
        <div class="rec-name">${safeName}</div>
        <div class="rec-meta">
          ${formatTime(r.duration)} · ${formatSize(r.blob ? r.blob.size : r.size)} · ${fmt.toUpperCase()}
          ${r.synced ? ' · <i data-lucide="cloud-check" style="width:12px;height:12px;color:var(--accent);display:inline-block;vertical-align:middle;" title="Synced to cloud"></i>' : ''}
        </div>
      </div>
      <div class="rec-actions">
        <button class="btn-ghost-sm btn-play-rec" data-i="${i}" title="Play"><i data-lucide="play" style="width:14px;height:14px;"></i></button>
        <button class="btn-ghost-sm btn-edit-rec" data-i="${i}" title="Edit"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
        ${window.location.hostname === 'localhost' ? `<button class="btn-ghost-sm btn-local-rec" data-i="${i}" title="Save to local library"><i data-lucide="hard-drive" style="width:14px;height:14px;"></i></button>` : ''}
        <button class="btn-ghost-sm btn-dl-rec" data-i="${i}" title="Download"><i data-lucide="download" style="width:14px;height:14px;"></i></button>
        <button class="btn-ghost-sm btn-del-rec" data-i="${i}" title="Delete" style="color:var(--accent);"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
      </div>
    `;
    recList.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
  updateSyncButton(recordings);
  renderRecentRecordings();
}

/** Render the recent recordings on the homepage */
function renderRecentRecordings() {
  const recentList = $('recent-list');
  if (!recentList) return;

  recentList.innerHTML = '';
  const recent = recordings.slice(0, 3);
  
  if (recent.length === 0) {
    recentList.innerHTML = '<div class="recent-empty" style="color:var(--text-tertiary);font-size:14px;">No recent recordings yet.</div>';
    return;
  }

  recent.forEach((r) => {
    const safeName = escapeHtml(r.filename);
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.onclick = (e) => {
       if (e.target.closest('button')) return;
       playRecording(r);
    };

    const dateStr = r.ts.toLocaleDateString(undefined, { month:'short', day:'numeric' });
    const fmt = getNativeFormat(r).toUpperCase();

    card.innerHTML = `
      <div class="recent-icon">
        <i data-lucide="video" style="width:16px;height:16px;color:var(--text-secondary);"></i>
      </div>
      <div class="recent-info">
        <div class="recent-name">${safeName}</div>
        <div class="recent-meta">${dateStr} · ${formatTime(r.duration)} · ${fmt}</div>
      </div>
      <button class="btn-ghost-sm" style="padding:6px;" title="Play">
        <i data-lucide="play" style="width:14px;height:14px;"></i>
      </button>
    `;
    recentList.appendChild(card);
  });
  if (window.lucide) lucide.createIcons();
}

/** Helper to play a recording in the dedicated player screen */
export async function playRecording(r) {
  const playerVideo = $('player-video');
  const playerFileName = $('player-filename');
  const playerDur = $('player-duration-val');
  const playerSize = $('player-size-val');

  if (!playerVideo) return;

  // Navigate to player screen
  window.location.hash = 'player';
  
  setTimeout(async () => {
    // Reset video
    playerVideo.pause();
    playerVideo.src = "";
    playerVideo.load();

    if (r.url) {
      playerVideo.src = r.url;
    } else if (r.isLocalServer) {
      try {
        const sb = await getSupabase();
        const { data: { session } } = await sb.auth.getSession();
        const authUrl = `${API_BASE}/api/local/file/${encodeURIComponent(r.filename)}`;
        const res = await fetch(authUrl, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const blob = await res.blob();
        playerVideo.src = URL.createObjectURL(blob);
      } catch (err) {
        console.error('Failed to play local server file:', err);
        showToast('Failed to load video from server', 'error');
        return;
      }
    }

    // Update metadata
    if (playerFileName) playerFileName.textContent = r.filename;
    if (playerDur) playerDur.textContent = formatTime(r.duration);
    if (playerSize) playerSize.textContent = formatSize(r.blob ? r.blob.size : r.size);

    playerVideo.play();
    lastViewedRecording = r;

    // Set up player-specific actions
    const dlBtn = $('player-dl');
    const delBtn = $('player-del');
    const shareBtn = $('player-share');
    const editBtn = $('player-edit');
    
    if (dlBtn) dlBtn.onclick = () => openDownloadModal(r);
    if (shareBtn) shareBtn.onclick = () => showToast('Cloud sync required to share', 'info');
    if (editBtn) editBtn.onclick = () => openTrimModal(r);
    if (delBtn) delBtn.onclick = () => {
      if (confirm('Delete this recording? This cannot be undone.')) {
        const idx = recordings.indexOf(r);
        if (idx !== -1) {
          removeRecording(idx);
          window.history.back();
        }
      }
    };

    if (window.lucide) lucide.createIcons();
  }, 100);
}

// ─── Init ──────────────────────────────────────────────────

/** Initialize: load persisted recordings, set up click handlers and modal */
export async function initRecordings() {
  try {
    const saved = await loadAllRecordings();
    if (saved.length > 0) recordings.push(...saved);
  } catch (err) {
    console.error('Failed to load from IDB:', err);
  }

  try {
    const serverRecs = await fetchLocalRecordings();
    for (const s of serverRecs) {
      if (!recordings.some(r => r.filename === s.filename)) recordings.push(s);
    }
  } catch (err) {
    console.error('Failed to sync with local server:', err);
  }

  recordings.sort((a, b) => b.ts - a.ts);
  renderRecordings();

  setupListeners();
}

/** Set up event listeners (moved from top-level) */
function setupListeners() {
  const recList = $('rec-list');
  const dlClose = $('dl-modal-close');
  const dlModal = $('dl-modal');
  const dlFmtMp4 = $('dl-fmt-mp4');
  const dlFmtWebm = $('dl-fmt-webm');
  const dlAction = $('dl-action');
  const trimModal = $('trim-modal');
  const trimClose = $('trim-modal-close');
  const trimCancel = $('trim-cancel');
  const trimPreviewBtn = $('trim-preview-btn');
  const trimApply = $('trim-apply');
  const trimStart = $('trim-range-start');
  const trimEnd = $('trim-range-end');
  const trimPreview = $('trim-preview-video');

  if (recList) {
    recList.addEventListener('click', (e) => {
      const pb  = e.target.closest('.btn-play-rec');
      const ed  = e.target.closest('.btn-edit-rec');
      const dl  = e.target.closest('.btn-dl-rec');
      const loc = e.target.closest('.btn-local-rec');
      const del = e.target.closest('.btn-del-rec');

      if (pb) {
        const r = recordings[parseInt(pb.dataset.i)];
        if (r) playRecording(r);
      }
      if (ed) {
        const r = recordings[parseInt(ed.dataset.i)];
        if (r) openEditor(r);
      }
      if (dl) {
        const r = recordings[parseInt(dl.dataset.i)];
        if (r) openDownloadModal(r);
      }
      if (loc) {
        const r = recordings[parseInt(loc.dataset.i)];
        if (r) saveRecordingToLocal(r);
      }
      if (del) {
        const idx = parseInt(del.dataset.i);
        if (confirm('Delete this recording? This cannot be undone.')) removeRecording(idx);
      }
    });
  }

  dlClose?.addEventListener('click', closeDownloadModal);
  dlModal?.addEventListener('click', (e) => { if (e.target === dlModal) closeDownloadModal(); });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dlModal?.classList.contains('open')) {
      e.stopPropagation();
      closeDownloadModal();
    }
    if (e.key === 'Escape' && trimModal?.classList.contains('open')) {
      e.stopPropagation();
      closeTrimModal();
    }
  });

  dlFmtMp4?.addEventListener('click', () => { if (!dlFmtMp4.classList.contains('disabled')) selectFormat('mp4'); });
  dlFmtWebm?.addEventListener('click', () => { if (!dlFmtWebm.classList.contains('disabled')) selectFormat('webm'); });
  dlAction?.addEventListener('click', executeDownload);

  trimClose?.addEventListener('click', closeTrimModal);
  trimCancel?.addEventListener('click', closeTrimModal);
  trimModal?.addEventListener('click', (e) => { if (e.target === trimModal) closeTrimModal(); });
  trimStart?.addEventListener('input', () => normalizeTrimRange('start'));
  trimEnd?.addEventListener('input', () => normalizeTrimRange('end'));
  trimPreviewBtn?.addEventListener('click', async () => {
    if (!trimPreview) return;
    const { start, end } = getTrimSelection();
    trimPreview.currentTime = start;
    trimPreview.ontimeupdate = () => {
      if (trimPreview.currentTime >= end) {
        trimPreview.pause();
        trimPreview.ontimeupdate = null;
      }
    };
    try {
      await trimPreview.play();
    } catch (_err) {
      showToast('Could not play trim preview', 'error');
    }
  });
  trimApply?.addEventListener('click', applyTrim);
}

/** Refresh recordings list (e.g. after login) */
export async function refreshRecordings() {
  try {
    const serverRecs = await fetchLocalRecordings();
    let added = 0;
    for (const s of serverRecs) {
      if (!recordings.some(r => r.filename === s.filename)) {
        recordings.push(s);
        added++;
      }
    }
    if (added > 0) {
      recordings.sort((a, b) => b.ts - a.ts);
      renderRecordings();
      showToast(`Found ${added} recovered recording${added !== 1 ? 's' : ''}`, 'success', 3000);
    }
  } catch (err) {
    console.error('Failed to refresh recordings:', err);
  }
}
