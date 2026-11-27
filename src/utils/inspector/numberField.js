/**
 * Number fields: parsing what people type, formatting, clamping, stepping
 * with the arrow keys and scrubbing by dragging. A spec's `min`, `max` and
 * `step` are in stored units; `scale` converts to what is displayed (an
 * opacity of 0.5 shows as 50 with `scale: 100`). Pure and isomorphic.
 * @module utils/inspector/numberField
 */

/**
 * @typedef {Object} NumberSpec
 * @property {number} [min] - Stored units
 * @property {number} [max]
 * @property {number} [step=1] - One arrow-key press, stored units
 * @property {number} [decimals=0] - Decimals shown (display units)
 * @property {number} [scale=1] - Display value = stored value × scale
 * @property {string} [unit] - Shown after the field: `%`, `px`, `°`, `s`
 */

/** Pixels of horizontal drag per step while scrubbing. */
export const SCRUB_PIXELS = 3;

/**
 * @param {number} value
 * @param {NumberSpec} [spec]
 * @returns {number} The value inside the spec's range
 */
export function clampNumber(value, spec = {}) {
  const { min = -Infinity, max = Infinity } = spec;
  return Math.min(max, Math.max(min, value));
}

/**
 * Remove float noise at the precision the field can show.
 * @param {number} value - Stored units
 * @param {NumberSpec} spec
 * @returns {number}
 */
function tidy(value, spec) {
  const scale = spec.scale || 1;
  const factor = 10 ** ((spec.decimals || 0) + 2);
  return Math.round(value * scale * factor) / factor / scale;
}

/**
 * Text shown in the field (without the unit).
 * @param {number} value - Stored units
 * @param {NumberSpec} [spec]
 * @returns {string} Empty for a value that is not a finite number
 */
export function formatNumber(value, spec = {}) {
  if (!Number.isFinite(value)) return '';
  const shown = (value * (spec.scale || 1)).toFixed(spec.decimals || 0);
  const trimmed = shown.includes('.') ? shown.replace(/\.?0+$/, '') : shown;
  return trimmed === '-0' ? '0' : trimmed;
}

/**
 * Read a typed value. Accepts a decimal comma, a trailing unit and one
 * simple sum (`100+20`, `50*2`, `90/4`, `10-2.5`).
 * @param {string} text
 * @param {NumberSpec} [spec]
 * @returns {number|null} Stored units, clamped; null when it is not a number
 */
export function parseNumber(text, spec = {}) {
  const clean = String(text ?? '')
    .replace(/,/g, '.')
    .replace(/[^\d.+\-*/]/g, '');
  const sum = /^(-?\d*\.?\d+)([+\-*/])(-?\d*\.?\d+)$/.exec(clean);
  let shown = Number(clean);
  if (sum) {
    const a = Number(sum[1]);
    const b = Number(sum[3]);
    shown = { '+': a + b, '-': a - b, '*': a * b, '/': a / b }[sum[2]];
  }
  if (clean === '' || !Number.isFinite(shown)) return null;
  return clampNumber(tidy(shown / (spec.scale || 1), spec), spec);
}

/**
 * One arrow-key step. Shift makes it ten steps, Alt a tenth of one.
 * @param {number} value - Stored units
 * @param {number} direction - 1 up, -1 down
 * @param {NumberSpec} [spec]
 * @param {{ shift?: boolean, alt?: boolean }} [mods]
 * @returns {number}
 */
export function stepNumber(value, direction, spec = {}, mods = {}) {
  const size = (spec.step || 1) * (mods.shift ? 10 : mods.alt ? 0.1 : 1);
  const base = Number.isFinite(value) ? value : 0;
  return clampNumber(tidy(base + direction * size, { ...spec, decimals: 4 }), spec);
}
