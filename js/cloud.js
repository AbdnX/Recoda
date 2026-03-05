/**
 * Cloud Sync Module
 * Handles synchronization of recordings with the backend API and Supabase Storage.
 */

import { $ } from './utils.js';
import { getSupabase } from './supabase.js';
import { showToast } from './toast.js';
import { loadAllRecordings, saveRecording, markAsSynced, existsRecording } from './storage.js';
import { getAllRecordings, markRecordingSynced, upsertRecording, renderRecordings } from './recordings.js';

// DOM refs
let syncBtn = null;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

/**
 * Initialize Cloud Sync UI
 * Validates Supabase config and injects Sync button into Library header.
 */
export async function initCloud() {
  const sb = await getSupabase();
  if (!sb) return; // No cloud config, invalid

  const libraryHeader = $('library-count')?.parentNode;
  if (libraryHeader && !document.getElementById('btn-cloud-sync')) {
    syncBtn = document.createElement('button');
    syncBtn.id = 'btn-cloud-sync';
    syncBtn.className = 'btn-ghost';
    syncBtn.style.marginLeft = 'auto';
    syncBtn.style.gap = '6px';
    syncBtn.innerHTML = `
      <i data-lucide="cloud" style="width:16px;height:16px;"></i>
      <span>Sync</span>
    `;
    syncBtn.onclick = handleSync;
    libraryHeader.appendChild(syncBtn);
    if (window.lucide) lucide.createIcons();
    
    // Initial check
    updateSyncButton(getAllRecordings());
  }
}

/**
 * Update Sync Button State
 * Called by recordings.js whenever the list changes.
 * @param {Array} recordings 
 */
export function updateSyncButton(recordings) {
  if (!syncBtn) return;
  
  if (syncBtn.innerHTML.includes('loader')) return; // Don't interrupt syncing state

  const unsyncedCount = recordings.filter(r => !r.synced).length;
  
  if (recordings.length === 0) {
    syncBtn.disabled = true;
    syncBtn.title = 'No recordings to sync';
    syncBtn.style.opacity = '0.5';
  } else if (unsyncedCount === 0) {
    syncBtn.disabled = true;
    syncBtn.title = 'All recordings already synced';
    syncBtn.style.opacity = '0.5';
  } else {
    syncBtn.disabled = false;
    syncBtn.title = `Sync ${unsyncedCount} recording${unsyncedCount !== 1 ? 's' : ''}`;
    syncBtn.style.opacity = '1';
  }
}

/**
 * Auto-upload a single recording to Supabase immediately after it is added.
 * Runs in the background — does not block the UI.
 * Sets rec.syncing / rec.synced / rec.syncFailed and re-renders the card.
 */
export async function autoUploadRecording(rec) {
  const sb = await getSupabase();
  if (!sb) return; // cloud not configured

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return; // not logged in — backgroundSync will pick it up on next login

  rec.syncing = true;
  rec.syncFailed = false;
  renderRecordings();

  try {
    await uploadRecording(rec, session.access_token);
    rec.syncing = false;
    renderRecordings();
  } catch (err) {
    console.warn('[Recoda] Auto-upload failed, will retry on next sync:', err.message);
    rec.syncing = false;
    rec.syncFailed = true;
    renderRecordings();
  }
}

/**
 * Run a full cloud sync silently in the background.
 * Uploads any locally unsynced recordings and downloads any cloud recordings
 * not yet in this browser's IndexedDB.
 * Safe to call on every app start — no-ops if already in sync.
 */
export async function backgroundSync() {
  const sb = await getSupabase();
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  try {
    await syncRecordings(session.access_token);
  } catch (err) {
    console.warn('[Recoda] Background sync failed:', err.message);
  }
}

/**
 * Handle Sync Button Click
 */
async function handleSync() {
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:16px;height:16px;"></i> Syncing...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const sb = await getSupabase();
    if (!sb) throw new Error('Supabase not configured');

    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showToast('Please log in to sync recordings', 'info');
      return;
    }

    await syncRecordings(session.access_token);
    showToast('Sync complete', 'success');

  } catch (err) {
    console.error('Sync failed:', err);
    showToast(`Sync failed: ${err.message}`, 'error');
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `<i data-lucide="cloud" style="width:16px;height:16px;"></i> Sync`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

/**
 * Core Sync Logic
 * 1. Get local recordings
 * 2. Send metadata to backend to compare
 * 3. Upload missing local files
 * 4. Download missing cloud files
 */
async function syncRecordings(token) {
  // 1. Get local recordings
  const localRecs = await loadAllRecordings();
  
  // Prepare payload: just metadata needed for diffing
  const payload = localRecs.map(r => ({
    filename: r.filename,
    created_at: r.ts.toISOString(), // ensure ISO string
    duration: r.duration,
    size: r.blob?.size || r.size || 0,
    mime_type: r.mime
  }));

  // 2. Call Sync API
  const res = await fetch(`${API_BASE}/api/recordings/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ localRecordings: payload })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Server sync error');
  }

  const { toUpload, toDownload } = await res.json();

  console.log('Sync plan:', { toUpload, toDownload });

  // 3. Upload missing files
  const inMemory = getAllRecordings();
  for (const item of toUpload) {
    const rec = localRecs.find(r => r.filename === item.filename);
    if (!rec) continue;

    // Reflect uploading state in the UI card
    const liveRec = inMemory.find(r => r.filename === item.filename);
    if (liveRec) { liveRec.syncing = true; liveRec.syncFailed = false; renderRecordings(); }

    try {
      await uploadRecording(rec, token);
      if (liveRec) { liveRec.syncing = false; renderRecordings(); }
    } catch (err) {
      if (liveRec) { liveRec.syncing = false; liveRec.syncFailed = true; renderRecordings(); }
      throw err;
    }
  }

  // 4. Download missing files
  for (const item of toDownload) {
    const downloaded = await downloadRecording(item);
    if (downloaded) {
      upsertRecording(downloaded);
    }
  }
}

/**
 * Upload a single recording
 */
async function uploadRecording(rec, token) {
  // 1. Get signed upload URL (or use direct upload if policy allows)
  // We'll use the signed URL endpoint we built to be safe
  console.log(`Getting signed URL for ${rec.filename}...`);
  const signRes = await fetch(`${API_BASE}/api/upload/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ filename: rec.filename })
  });

  if (!signRes.ok) throw new Error('Failed to get upload signature');
  const { signedUrl, path } = await signRes.json();

  // 2. Upload to Supabase Storage via signed URL
  console.log(`Uploading blob to ${path}...`);
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    body: rec.blob,
    headers: {
      'Content-Type': rec.mime
    }
  });

  if (!uploadRes.ok) throw new Error('Upload to storage failed');

  // 3. Save metadata to backend
  console.log('Saving metadata...');
  const metaRes = await fetch(`${API_BASE}/api/recordings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      filename: rec.filename,
      duration: rec.duration,
      size: rec.size,
      mime_type: rec.mime
    })
  });

  if (!metaRes.ok) throw new Error('Failed to save metadata');

  // 4. Mark as synced locally
  await markAsSynced(rec.id);
  markRecordingSynced(rec.id, rec.filename);
}

/**
 * Download a single recording
 */
async function downloadRecording(item) {
  if (!item.downloadUrl) return;
  if (await existsRecording(item.filename)) return null;

  // 1. Fetch Blob
  const res = await fetch(item.downloadUrl);
  if (!res.ok) throw new Error(`Failed to download ${item.filename}`);
  const blob = await res.blob();

  // 2. Save to IndexedDB
  const rec = {
    blob,
    filename: item.filename,
    duration: item.duration || 0, // Backend should return this if we saved it!
    mime: item.mime_type || blob.type,
    ts: new Date(item.created_at),
    synced: true,
    size: blob.size
  };

  const id = await saveRecording(rec);
  rec.id = id;
  rec.url = URL.createObjectURL(blob);
  return rec;
}
