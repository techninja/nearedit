/**
 * Display formatting for media items: durations, sizes, dimensions and the
 * one-line summary shown under a file name. Pure and isomorphic.
 * @module utils/media/format
 */

/** @typedef {import('./library.js').MediaItem} MediaItem */

/** Icon (key of src/icons.json) for each media type. */
export const TYPE_ICONS = { video: 'film', audio: 'music', image: 'image', text: 'file-text' };

/**
 * Seconds as a compact clock: `0:07`, `12:05`, `1:02:03`.
 * @param {number|null|undefined} seconds
 * @returns {string} Empty when there is no duration
 */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds + 1e-6);
  const s = String(whole % 60).padStart(2, '0');
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Seconds with tenths, for short ranges: `4.5 s`, `1:02.5`.
 * @param {number} seconds
 * @returns {string}
 */
export function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const tenths = Math.round(Math.max(0, seconds) * 10);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const rest = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${rest.toFixed(1).padStart(4, '0')}`;
}

/**
 * Bytes as a short size: `812 B`, `41 KB`, `7.3 MB`, `1.2 GB`.
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit > 1 && value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * Picture size as `1920×1080`, turned upright for rotated phone footage.
 * @param {{ width?: number|null, height?: number|null, rotation?: number }} item
 * @returns {string} Empty when the file has no picture
 */
export function formatResolution(item) {
  if (!(item?.width > 0) || !(item?.height > 0)) return '';
  const sideways = Math.abs(item.rotation || 0) % 180 === 90;
  return sideways ? `${item.height}×${item.width}` : `${item.width}×${item.height}`;
}

/**
 * The facts worth showing under a file name, most useful first.
 * @param {MediaItem} item
 * @returns {string[]} e.g. `['0:12', '1920×1080', '30 fps']`
 */
export function metaParts(item) {
  const parts = [formatClock(item.duration), formatResolution(item)];
  if (item.type === 'video' && item.fps > 0) parts.push(`${Math.round(item.fps * 100) / 100} fps`);
  if (item.type === 'text') parts.push('text');
  if (item.type === 'video' && !item.hasAudio) parts.push('no sound');
  return parts.filter(Boolean);
}
