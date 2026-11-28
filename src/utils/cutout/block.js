/**
 * The whole `cutout` block of a clip — its settings and what was made for
 * it — read from a loaded document and checked. A clip has the block when
 * there is something to say: cutout on, a setting that differs from its
 * default, or a cutout that was made. Isomorphic and pure.
 * Contract: docs/app-spec/CUTOUT.md § In the document.
 * @module utils/cutout/block
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { CUTOUT_DEFAULTS, CUTOUT_FIELDS, normalizeCutout } from './fields.js';
import { cleanMade } from './made.js';

/** @typedef {import('./types.js').CutoutBlock} CutoutBlock */
/** @typedef {(path: string, message: string) => void} Report */

const NAMES = /** @type {(keyof CutoutBlock)[]} */ (Object.keys(CUTOUT_FIELDS));

/**
 * Read a clip's `cutout` block: its settings (`normalizeCutout`) and, when
 * it is usable, what was made for it (`cleanMade`).
 * @param {any} raw - Whatever a document holds
 * @returns {CutoutBlock|null} null when there is nothing to keep — cutout
 *   off, every setting at its default and nothing made; the stored block
 *   itself when it is already clean
 */
export function cleanCutout(raw) {
  if (!isPlainObject(raw)) return null;
  const settings = normalizeCutout(raw);
  const made = cleanMade(raw.made);
  if (!made && NAMES.every((name) => settings[name] === CUTOUT_DEFAULTS[name])) return null;
  const same =
    Object.keys(raw).length === NAMES.length + (made ? 1 : 0) &&
    NAMES.every((name) => raw[name] === settings[name]) &&
    raw.made === (made ?? undefined);
  return same ? raw : made ? { ...settings, made } : settings;
}

/**
 * Check a clip's `cutout` field for a document validator: absent, or its
 * settings exactly as `normalizeCutout` writes them, with `made` — when it
 * is there — exactly as `cleanMade` writes it.
 * @param {any} cutout
 * @param {string} path - Path of the field, e.g. `tracks[0].clips[2].cutout`
 * @param {Report} report
 */
export function checkCutout(cutout, path, report) {
  if (cutout === undefined) return;
  if (!isPlainObject(cutout)) return report(path, 'must be an object');
  const normal = normalizeCutout(cutout);
  for (const name of Object.keys(cutout)) {
    if (name !== 'made' && !Object.hasOwn(CUTOUT_FIELDS, name))
      report(`${path}.${name}`, 'is not a field of a cutout');
  }
  for (const [name, spec] of Object.entries(CUTOUT_FIELDS)) {
    if (cutout[name] === normal[/** @type {keyof CutoutBlock} */ (name)]) continue;
    const range = spec.type === 'number' ? `a number from ${spec.min} to ${spec.max}` : '';
    const choice = spec.options ? `one of: ${spec.options.join(', ')}` : 'true or false';
    report(`${path}.${name}`, `must be ${range || choice}`);
  }
  if (Object.hasOwn(cutout, 'made') && cleanMade(cutout.made) !== cutout.made) {
    report(
      `${path}.made`,
      'must be { file, key, source, start, end, fps, width, height, frames } of a finished cutout',
    );
  }
}
