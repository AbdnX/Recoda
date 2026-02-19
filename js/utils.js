/**
 * Shared utility functions.
 */

/** Shorthand for getElementById */
export const $ = (id) => document.getElementById(id);

/** Format seconds to HH:MM:SS */
export function formatTime(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Generate a timestamp string for filenames: YYYY-MM-DD_HH-MM */
export function getTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

/** Get file extension from MIME type */
export function getFileExtension(mime) {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/** Format bytes to a human-readable size string */
export function formatSize(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
