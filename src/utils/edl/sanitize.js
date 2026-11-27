/**
 * Value coercion shared by normalisation and inspector edits: turn anything
 * (LLM output, old files, form input) into the type, range and enum a field
 * expects, falling back to a known-good value. Isomorphic and pure.
 * @module utils/edl/sanitize
 */

import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import { BLEND_MODES, FADE_CURVES, TEXT_ANIMATIONS, TEXT_UNITS } from './defaults.js';
import { EASINGS } from './easing.js';
import { mergeEffects } from './effectList.js';
import { mergeBag } from './jsonBag.js';
import { mergeKeyframes } from './keyList.js';

/** @typedef {Record<string, string[]>} Enums */

/** Bundled font families plus the generic names older documents use. */
const FONTS = [...new Set(FONT_FAMILIES.flatMap((family) => [family.generic, family.id]))];

/**
 * Allowed values of enumerated fields, by key.
 * @type {Enums}
 */
export const ENUMS = {
  fit: ['cover', 'contain'],
  fontFamily: FONTS,
  align: ['left', 'center', 'right'],
  blendMode: BLEND_MODES,
  fadeInCurve: FADE_CURVES,
  fadeOutCurve: FADE_CURVES,
};

/** Enumerations of a `text.animateIn` / `text.animateOut` block. */
export const ANIMATION_ENUMS = { type: TEXT_ANIMATIONS, by: TEXT_UNITS, ease: EASINGS };

/**
 * Numeric ranges, by key. Any key containing "crop" is a 0..1 fraction.
 * @type {Record<string, [number, number]>}
 */
export const RANGES = {
  volume: [0, 2],
  opacity: [0, 1],
  anchorX: [0, 1],
  anchorY: [0, 1],
  fontSize: [1, 4000],
  outlineWidth: [0, 1000],
  weight: [0, 1000],
  lineHeight: [0.1, 10],
  letterSpacing: [-1000, 1000],
  maxWidth: [0, 100000],
  boxPadding: [0, 10],
  boxRadius: [0, 10000],
  shadowBlur: [0, 1000],
  duration: [0, 600],
  stagger: [0, 60],
  seed: [0, 4294967295],
};

/**
 * Fields that are not plain shapes: free-form bags, lists, and blocks with
 * enumerations of their own. Each merges a patch into a clean value and
 * returns that value itself when nothing changed.
 * @type {Record<string, (base: any, patch: any) => any>}
 */
const CUSTOM = {
  params: mergeBag,
  effects: mergeEffects,
  keyframes: mergeKeyframes,
  animateIn: (base, patch) => mergeShape(base, patch, ANIMATION_ENUMS),
  animateOut: (base, patch) => mergeShape(base, patch, ANIMATION_ENUMS),
};

/**
 * @param {any} value
 * @returns {boolean} True for plain objects (not arrays, not null)
 */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {any} value - Number or numeric string
 * @param {number} fallback
 * @returns {number} A finite number
 */
export function toNumber(value, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : fallback;
}

/**
 * Coerce one value to the type of `fallback`, honouring ranges and enums.
 * @param {string} key - Field name, selects the range or enum
 * @param {any} value
 * @param {any} fallback - Known-good value; also defines the wanted type
 * @param {Enums} [enums] - Enumerations in force, `ENUMS` by default
 * @returns {any}
 */
export function coerce(key, value, fallback, enums = ENUMS) {
  if (value === undefined || value === null) return fallback;
  if (CUSTOM[key]) return CUSTOM[key](fallback, value);
  if (typeof fallback === 'number') {
    const range = RANGES[key] || (/crop/i.test(key) ? [0, 1] : null);
    const number = toNumber(value, fallback);
    return range ? Math.min(range[1], Math.max(range[0], number)) : number;
  }
  if (typeof fallback === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' ? true : value === 'false' ? false : fallback;
  }
  if (typeof fallback === 'string') {
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string') return fallback;
    return enums[key] && !enums[key].includes(text) ? fallback : text;
  }
  return isObject(fallback) ? mergeShape(fallback, value) : fallback;
}

/**
 * Deep-merge `patch` into `base`, keeping exactly the keys of `base`.
 * Values of the wrong type, out-of-enum strings and unknown keys are
 * ignored; numbers are clamped to the field's range. The free-form fields
 * merge by their own rules: `params` and `keyframes` key by key (a `null`
 * removes its key), `effects` as a whole list — see jsonBag.js, keyList.js
 * and effectList.js.
 * @param {Record<string, any>} base - Complete, valid object
 * @param {any} patch
 * @param {Enums} [enums] - Enumerations in force, `ENUMS` by default
 * @returns {Record<string, any>} `base` itself when nothing changed
 */
export function mergeShape(base, patch, enums = ENUMS) {
  if (!isObject(patch)) return base;
  let changed = false;
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(base)) {
    out[key] = coerce(key, patch[key], base[key], enums);
    if (out[key] !== base[key]) changed = true;
  }
  return changed ? out : base;
}
