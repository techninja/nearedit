/**
 * A colour as a Design Tokens file writes it (colour module 2025.10 § 4.1:
 * `{ colorSpace, components, alpha?, hex? }`) and as a theme keeps it
 * (`#rrggbb`), both ways. Reading takes any of the format's colour spaces;
 * writing uses sRGB with the hex fallback, which every tool reads.
 * Isomorphic and pure.
 * @module utils/theme/tokens/color
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { parseColor } from '#utils/compose/color.js';
import { cleanColor, toHex } from '#utils/theme/color.js';
import { TO_SRGB } from './spaces.js';

/**
 * @param {string} color - `#rrggbb`
 * @returns {{ colorSpace: 'srgb', components: number[], hex: string }} The
 *   `$value` of a colour token
 */
export function tokenColor(color) {
  const components = parseColor(color)
    .slice(0, 3)
    .map((channel) => Math.round((channel / 255) * 10000) / 10000);
  return { colorSpace: 'srgb', components, hex: cleanColor(color) };
}

/**
 * Read the `$value` of a colour token.
 * @param {unknown} value - As written, references already resolved
 * @returns {{ color: string, problem: string, note: string }} `color`:
 *   `#rrggbb`, or '' with the `problem` that says why not; `note`: what was
 *   read with a reservation
 */
export function readColor(value) {
  /** @type {(problem: string) => { color: string, problem: string, note: string }} */
  const bad = (problem) => ({ color: '', problem, note: '' });
  if (typeof value === 'string') {
    // Files written before 2025.10 give a colour as text.
    const color = cleanColor(value);
    const note = 'is written as text, the form of an earlier draft: 2025.10 writes an object';
    return color ? { color, problem: '', note } : bad('is not a colour');
  }
  if (!isPlainObject(value)) return bad('must be a colour: { colorSpace, components }');
  const { colorSpace, components, alpha } = /** @type {Record<string, any>} */ (value);
  const convert = Object.hasOwn(TO_SRGB, colorSpace) ? TO_SRGB[colorSpace] : null;
  if (!convert) {
    return bad(`has the colour space ${JSON.stringify(colorSpace)}, which the format does not have`);
  }
  const usable =
    Array.isArray(components) &&
    components.length === 3 &&
    components.every((c) => c === 'none' || Number.isFinite(c));
  if (!usable) return bad('needs three components, each a number or "none"');
  const [r, g, b] = convert(components.map((c) => (c === 'none' ? 0 : c)));
  if (![r, g, b].every(Number.isFinite)) return bad('has components that are not a colour');
  const seeThrough = alpha !== undefined && alpha !== 1;
  return {
    color: toHex(r * 255, g * 255, b * 255),
    problem: '',
    note: seeThrough ? 'has an alpha, which is ignored: a role is opaque' : '',
  };
}
