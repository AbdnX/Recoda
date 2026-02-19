/**
 * IndexedDB storage for persisting recordings across page refreshes.
 * Stores video blobs locally in the browser — no backend needed.
 */

const DB_NAME = 'recoda-db';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

let db = null;

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      console.error('IndexedDB error:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Save a recording to IndexedDB.
 * @param {{ blob: Blob, filename: string, duration: number, mime: string, ts: Date }} rec
 * @returns {Promise<number>} The auto-generated ID
 */
export async function saveRecording(rec) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      blob: rec.blob,
      filename: rec.filename,
      duration: rec.duration,
      mime: rec.mime,
      ts: rec.ts.toISOString(),
      size: rec.blob.size,
      synced: !!rec.synced,
    };
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all recordings from IndexedDB, newest first.
 * @returns {Promise<Array>} Array of recording objects with blob URLs generated
 */
export async function loadAllRecordings() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      // Sort newest first, generate blob URLs
      items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
      const recordings = items.map((item) => ({
        id: item.id,
        blob: item.blob,
        url: URL.createObjectURL(item.blob),
        filename: item.filename,
        duration: item.duration,
        mime: item.mime,
        ts: new Date(item.ts),
        synced: !!item.synced,
      }));
      resolve(recordings);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a recording from IndexedDB by its ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteRecording(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all recordings from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearAllRecordings() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mark a recording as synced in IndexedDB
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function markAsSynced(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const data = request.result;
      if (!data) return resolve(); // Record not found, maybe deleted
      
      data.synced = true;
      const updateRequest = store.put(data);
      
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}
/**
 * Check if a recording with this filename already exists in IndexedDB.
 * @param {string} filename
 * @returns {Promise<boolean>}
 */
export async function existsRecording(filename) {
  const items = await loadAllRecordings();
  return items.some(i => i.filename === filename);
}
