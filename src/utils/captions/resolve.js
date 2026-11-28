/**
 * From a stored caption style to the one captions are drawn with, and back.
 * A document stores a preset's name and what differs from it; drawing wants
 * every field, usable and inside its range. Stored values are untrusted —
 * hand-written JSON, a director, an older version — so each is coerced to
 * its field's type and range and falls back to the preset's value when it
 * cannot be used. Nothing here throws.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/resolve
 */

import { coerceParam } from '#utils/compose/params.js';
import { CAPTION_PRESETS, deepFreeze } from './presets.js';
import { CAPTION_STYLE, PRESET_NAMES, STYLE_PATHS, readPath, writePath } from './style.js';

/** @typedef {import('./types.js').CaptionStyle} CaptionStyle */

/** Longest font family name kept. */
const MAX_FAMILY = 80;

/** @type {WeakMap<object, CaptionStyle>} Resolved styles by the object they came from */
const memo = new WeakMap();
/** @type {WeakSet<object>} Styles this module resolved: resolving one again returns it */
const resolved = new WeakSet(PRESET_NAMES.map((name) => CAPTION_PRESETS[name].style));

/**
 * One stored value as its field's type, inside its range.
 * @param {import('./style.js').CaptionField} spec
 * @param {unknown} value
 * @param {any} fallback - The preset's value
 * @returns {any}
 */
function coerce(spec, value, fallback) {
  if (value === undefined) return fallback;
  const usable = coerceParam({ ...spec, default: fallback }, value);
  if (spec.type === 'number') {
    // Counts and weights move in whole steps.
    const stepped = spec.step >= 1 ? Math.round(usable / spec.step) * spec.step : usable;
    return Math.max(spec.min, Math.min(spec.max, stepped));
  }
  if (spec.type === 'color') return usable.toLowerCase();
  if (spec.type === 'text') return usable.trim().slice(0, MAX_FAMILY) || fallback;
  return usable;
}

/**
 * @param {object} style - What is stored
 * @returns {{ raw: any, preset: string }} The stored style when it can be
 *   read as one, and the preset it names
 */
function read(style) {
  const raw = Array.isArray(style) ? {} : style;
  const named = readPath(raw, 'preset');
  return { raw, preset: PRESET_NAMES.includes(named) ? named : 'clean' };
}

/**
 * The style captions are drawn with: the named preset with the stored
 * differences applied, complete and inside every range. A preset's name
 * alone is accepted, and so is nothing at all. The result is frozen, and
 * the same stored object gives the same result object, so anything worked
 * out from a style can be remembered by it.
 * @param {unknown} [style] - What a document stores, or an already resolved style
 * @returns {CaptionStyle}
 */
export function resolveCaptionStyle(style) {
  // A preset's name, or nothing: the preset itself, always the same object.
  if (style === null || typeof style !== 'object') {
    const name = PRESET_NAMES.includes(/** @type {string} */ (style)) ? style : 'clean';
    return CAPTION_PRESETS[/** @type {string} */ (name)].style;
  }
  if (resolved.has(style)) return /** @type {CaptionStyle} */ (style);
  const known = memo.get(style);
  if (known) return known;
  /** @type {Record<string, any>} */
  const out = {};
  let preset = 'clean';
  try {
    const stored = read(style);
    preset = stored.preset;
    const base = CAPTION_PRESETS[preset].style;
    for (const path of STYLE_PATHS) {
      const value = coerce(CAPTION_STYLE[path], readPath(stored.raw, path), readPath(base, path));
      writePath(out, path, value);
    }
    out.preset = preset;
  } catch {
    // Only an object that throws when read gets here; a preset is always drawable.
    return CAPTION_PRESETS[preset].style;
  }
  const result = /** @type {CaptionStyle} */ (deepFreeze(out));
  resolved.add(result);
  memo.set(style, result);
  return result;
}

/**
 * What a document stores for a style: the preset's name and only the
 * fields that differ from it, each usable. Unknown fields are dropped.
 * @param {unknown} raw
 * @returns {Record<string, any>} A plain JSON object, `{ preset, … }`
 */
export function normalizeCaptionStyle(raw) {
  const style = resolveCaptionStyle(raw);
  const base = CAPTION_PRESETS[style.preset].style;
  /** @type {Record<string, any>} */
  const out = { preset: style.preset };
  for (const path of STYLE_PATHS) {
    const value = readPath(style, path);
    if (path !== 'preset' && value !== readPath(base, path)) writePath(out, path, value);
  }
  return out;
}

/**
 * The fields of a style as an editor's controls want them: one value per
 * schema path.
 * @param {unknown} style
 * @returns {Record<string, any>} `{ 'highlight.color': '#facc15', … }`
 */
export function flatCaptionStyle(style) {
  const full = resolveCaptionStyle(style);
  return Object.fromEntries(STYLE_PATHS.map((path) => [path, readPath(full, path)]));
}
