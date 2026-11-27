/**
 * Timecode — seconds ↔ `HH:MM:SS:FF` for a frame rate. Non-drop-frame: at
 * fractional rates (29.97, 23.976) frames are counted at the real rate and
 * shown against the rounded base, as on any NDF counter.
 * Pure and isomorphic.
 * @module utils/playback/timecode
 */

/** Absorbs float error so that 7/30 s reads as frame 7, not 6. */
const EPSILON = 1e-6;

/**
 * Frames per timecode second: the frame rate rounded to a whole number.
 * @param {number} [fps=30]
 * @returns {number}
 */
export function timecodeBase(fps = 30) {
  return Math.max(1, Math.round(fps > 0 ? fps : 30));
}

/**
 * Index of the frame showing at a moment.
 * @param {number} seconds
 * @param {number} [fps=30]
 * @returns {number}
 */
export function frameAt(seconds, fps = 30) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds * (fps > 0 ? fps : 30) + EPSILON);
}

/**
 * Format seconds as `HH:MM:SS:FF`.
 * @param {number} seconds
 * @param {number} [fps=30]
 * @returns {string}
 */
export function formatTimecode(seconds, fps = 30) {
  const base = timecodeBase(fps);
  const frames = frameAt(seconds, fps);
  const wholeSeconds = Math.floor(frames / base);
  const frameDigits = Math.max(2, String(base - 1).length);
  const pad = (/** @type {number} */ n, width = 2) => String(n).padStart(width, '0');
  const hh = pad(Math.floor(wholeSeconds / 3600));
  const mm = pad(Math.floor(wholeSeconds / 60) % 60);
  const ss = pad(wholeSeconds % 60);
  return `${hh}:${mm}:${ss}:${pad(frames % base, frameDigits)}`;
}

/**
 * Parse `HH:MM:SS:FF` (leading fields optional, `;` accepted) to seconds.
 * @param {string} text
 * @param {number} [fps=30]
 * @returns {number} Seconds, or NaN when the text is not a timecode
 */
export function parseTimecode(text, fps = 30) {
  const parts = String(text ?? '')
    .trim()
    .split(/[:;]/);
  if (parts.length > 4 || parts.some((part) => !/^\d+$/.test(part))) return NaN;
  const [ff, ss = 0, mm = 0, hh = 0] = parts.reverse().map(Number);
  const frames = ((hh * 60 + mm) * 60 + ss) * timecodeBase(fps) + ff;
  return frames / (fps > 0 ? fps : 30);
}
