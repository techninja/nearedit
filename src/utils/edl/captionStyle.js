/**
 * The one style a timeline draws every caption with, as edits: setting it
 * whole and changing one field. A document stores a preset's name and what
 * differs from it (`normalizeCaptionStyle`), or nothing — the default.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/edl/captionStyle
 */

import { coerceParam } from '#utils/compose/params.js';
import { normalizeCaptionStyle, resolveCaptionStyle } from '#utils/captions/resolve.js';
import { CAPTION_STYLE, readPath, writePath } from '#utils/captions/style.js';
import { sameJson } from './jsonBag.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Set the style every caption of the timeline is drawn with.
 * @param {Edl} edl
 * @param {unknown} style - A preset's name, or a style (complete, or a
 *   preset and what differs from it); stored as `normalizeCaptionStyle`
 *   writes it. `null` removes the document's style: captions are then drawn
 *   with the default
 * @returns {Edl}
 */
export function setCaptionStyle(edl, style) {
  if (style === null || style === undefined) {
    if (edl.captions === undefined) return edl;
    const { captions: _dropped, ...rest } = edl;
    return /** @type {Edl} */ (rest);
  }
  const next = normalizeCaptionStyle(style);
  if (edl.captions && sameJson(edl.captions.style, next)) return edl;
  return { ...edl, captions: { style: next } };
}

/**
 * Change one field of the timeline's caption style.
 * @param {Edl} edl
 * @param {string} path - A path of `CAPTION_STYLE`: `size`, `highlight.color`…
 *   `preset` switches to that preset as it comes, dropping what differed
 * @param {unknown} value - Coerced to the field's type and range; a value
 *   that cannot be used changes nothing. `null` returns the field to what
 *   the preset says
 * @returns {Edl}
 */
export function patchCaptionStyle(edl, path, value) {
  const spec = Object.hasOwn(CAPTION_STYLE, path) ? CAPTION_STYLE[path] : null;
  if (!spec) return edl;
  const stored = edl.captions?.style;
  if (path === 'preset') {
    return spec.options.includes(/** @type {string} */ (value))
      ? setCaptionStyle(edl, { preset: value })
      : edl;
  }
  const before = normalizeCaptionStyle(stored);
  /** @type {Record<string, any>} */
  const next = structuredClone(before);
  if (value === null || value === undefined) {
    // What the preset says: the stored difference goes.
    const keys = path.split('.');
    const holder = keys.length > 1 ? next[keys[0]] : next;
    if (holder) delete holder[keys[keys.length - 1]];
  } else {
    const current = readPath(resolveCaptionStyle(stored), path);
    writePath(next, path, coerceParam({ ...spec, default: current }, value));
  }
  // Nothing changed: a document that names no style keeps naming none.
  return sameJson(normalizeCaptionStyle(next), before) ? edl : setCaptionStyle(edl, next);
}
