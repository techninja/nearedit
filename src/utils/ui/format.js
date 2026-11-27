/**
 * Small display formatters shared by the pages: sizes, lengths, dates.
 * Pure — every function takes what it needs and returns text.
 * @module utils/ui/format
 */

/**
 * @param {number} bytes
 * @returns {string} e.g. "12.3 MB"
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * A length of time for people: "0:07", "3:25", "1:02:03".
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const AGO_STEPS = [
  [60, 'minute'],
  [24, 'hour'],
  [30, 'day'],
  [12, 'month'],
  [Infinity, 'year'],
];

/**
 * How long ago something happened: "just now", "5 minutes ago", "3 days ago".
 * @param {string|number|Date} when - ISO string, epoch milliseconds or Date
 * @param {number} [now] - Epoch milliseconds
 * @returns {string} '' when `when` is not a date
 */
export function timeAgo(when, now = Date.now()) {
  const then = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!when || !Number.isFinite(then)) return '';
  let value = Math.max(0, now - then) / 60000;
  if (value < 1) return 'just now';
  for (const [size, unit] of AGO_STEPS) {
    if (value < /** @type {number} */ (size)) {
      const n = Math.floor(value);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
    value /= /** @type {number} */ (size);
  }
  return '';
}

/**
 * A date with time in the reader's locale, for tooltips.
 * @param {string|number} when
 * @returns {string}
 */
export function formatDateTime(when) {
  const date = new Date(when);
  if (!when || !Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Last part of a path: "/a/b/c" → "c".
 * @param {string} path
 * @returns {string}
 */
export function baseName(path) {
  const parts = String(path || '')
    .split(/[/\\]/)
    .filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * "1 file" / "3 files".
 * @param {number} count
 * @param {string} noun - Singular
 * @param {string} [plural]
 * @returns {string}
 */
export function countOf(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}
