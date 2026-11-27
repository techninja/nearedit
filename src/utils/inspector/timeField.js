/**
 * Time fields of the inspector: what people may type for a timeline
 * position or a duration. Pure and isomorphic.
 * @module utils/inspector/timeField
 */

import { parseTimecode } from '#utils/playback/timecode.js';

/**
 * Read a typed time. Accepted forms:
 * - timecode `HH:MM:SS:FF` with leading fields optional (`1:05:12`)
 * - digits only, filled in from the right like a timecode (`512` = 5 s 12 f)
 * - seconds with a decimal point or an `s` (`12.5`, `3s`)
 * - frames with an `f` (`45f`)
 * @param {string} text
 * @param {number} [fps=30]
 * @returns {number} Seconds, or NaN when the text is not a time
 */
export function parseTime(text, fps = 30) {
  const clean = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(',', '.');
  if (!clean) return NaN;
  const rate = fps > 0 ? fps : 30;
  if (/^\d+f$/.test(clean)) return Number(clean.slice(0, -1)) / rate;
  if (/^\d*\.?\d+s$/.test(clean)) return Number(clean.slice(0, -1));
  if (/^\d*\.\d+$/.test(clean)) return Number(clean);
  if (/^\d+$/.test(clean)) {
    const pairs = clean.padStart(8, '0').slice(-8).match(/\d\d/g);
    return parseTimecode(pairs.join(':'), rate);
  }
  return parseTimecode(clean, rate);
}

/**
 * A time moved by whole frames (arrow keys: one frame; with Shift: one second).
 * @param {number} seconds
 * @param {number} direction - 1 later, -1 earlier
 * @param {number} [fps=30]
 * @param {{ shift?: boolean }} [mods]
 * @returns {number} On the frame grid, never below 0
 */
export function stepTime(seconds, direction, fps = 30, mods = {}) {
  const rate = fps > 0 ? fps : 30;
  const frames = Math.round((Number.isFinite(seconds) ? seconds : 0) * rate);
  const by = mods.shift ? Math.round(rate) : 1;
  return Math.max(0, frames + direction * by) / rate;
}
