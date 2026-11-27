/**
 * One vocabulary for the value box atom, whatever it holds: plain numbers
 * (`numberField.js`) or times shown as timecode (`timeField.js`, selected
 * with `spec.kind: 'time'`). Pure and isomorphic.
 * @module utils/inspector/fieldValue
 */

import { formatTimecode } from '#utils/playback/timecode.js';
import { SCRUB_PIXELS, formatNumber, parseNumber, stepNumber } from './numberField.js';
import { parseTime, stepTime } from './timeField.js';

/**
 * @typedef {import('./numberField.js').NumberSpec & { kind?: 'number'|'time', fps?: number }} FieldSpec
 */

/**
 * @param {number} value
 * @param {FieldSpec} [spec]
 * @returns {string} Text for the box
 */
export function formatValue(value, spec = {}) {
  if (spec.kind !== 'time') return formatNumber(value, spec);
  return Number.isFinite(value) ? formatTimecode(value, spec.fps) : '';
}

/**
 * @param {string} text - What was typed
 * @param {FieldSpec} [spec]
 * @returns {number|null} null when it cannot be read
 */
export function parseValue(text, spec = {}) {
  if (spec.kind !== 'time') return parseNumber(text, spec);
  const seconds = parseTime(text, spec.fps);
  return Number.isFinite(seconds) ? Math.max(spec.min ?? 0, seconds) : null;
}

/**
 * @param {number} value
 * @param {number} steps - Whole steps, negative for down
 * @param {FieldSpec} [spec]
 * @param {{ shift?: boolean, alt?: boolean }} [mods]
 * @returns {number}
 */
export function stepValue(value, steps, spec = {}, mods = {}) {
  if (spec.kind !== 'time') return stepNumber(value, steps, spec, mods);
  return Math.max(spec.min ?? 0, stepTime(value, steps, spec.fps, mods));
}

/**
 * The value after dragging the label sideways.
 * @param {number} start - Value when the drag began
 * @param {number} dx - Pixels moved
 * @param {FieldSpec} [spec]
 * @param {{ shift?: boolean, alt?: boolean }} [mods]
 * @returns {number}
 */
export function scrubValue(start, dx, spec = {}, mods = {}) {
  const steps = Math.trunc(dx / SCRUB_PIXELS);
  const from = Number.isFinite(start) ? start : 0;
  return steps ? stepValue(from, steps, spec, mods) : from;
}
