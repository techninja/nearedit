/**
 * The `cutout` block of a clip as data: its fields with their defaults and
 * limits — an inspector is generated from the table — reading a block from
 * whatever a file or a language model holds, and checking one. Isomorphic
 * and pure. Contract: docs/app-spec/CUTOUT.md § In the document.
 * @module utils/cutout/fields
 */

import { coerceParam } from '#utils/compose/params.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';

/** @typedef {import('./types.js').CutoutBlock} CutoutBlock */
/** @typedef {(path: string, message: string) => void} Report */

/** What is done with the background. */
export const CUTOUT_MODES = ['remove', 'blur'];

/**
 * The fields of a `cutout` block, in the order an inspector shows them.
 * Lengths are in units: hundredths of the frame's shorter side.
 * @type {Record<keyof CutoutBlock, import('#utils/compose/params.js').ParamSpec>}
 */
export const CUTOUT_FIELDS = {
  on: { type: 'boolean', default: false, label: 'Cut out person' },
  mode: { type: 'select', default: 'remove', options: CUTOUT_MODES, label: 'Background' },
  feather: {
    ...{ type: 'number', default: 0.4, min: 0, max: 5, step: 0.1, unit: 'u' },
    label: 'Edge softness',
  },
  shrink: {
    ...{ type: 'number', default: 0.1, min: -3, max: 3, step: 0.1, unit: 'u' },
    label: 'Edge shrink',
  },
  blur: {
    ...{ type: 'number', default: 3, min: 0, max: 20, step: 0.5, unit: 'u' },
    label: 'Background blur',
    when: { mode: ['blur'] },
  },
};

/** @type {CutoutBlock} A block with every field at its default: cutout off. */
export const CUTOUT_DEFAULTS = /** @type {any} */ (
  Object.freeze(
    Object.fromEntries(Object.entries(CUTOUT_FIELDS).map(([name, spec]) => [name, spec.default])),
  )
);

/**
 * Read a `cutout` block: every field of the table, each the stored value
 * when it is usable — of the right type, numbers held inside their limits —
 * and the default otherwise. Unknown fields are left out.
 * @param {any} raw - Whatever a document holds; anything but a plain object
 *   gives the defaults
 * @returns {CutoutBlock}
 */
export function normalizeCutout(raw) {
  const stored = isPlainObject(raw) ? raw : {};
  /** @type {Record<string, any>} */
  const block = {};
  for (const [name, spec] of Object.entries(CUTOUT_FIELDS)) {
    block[name] = coerceParam(spec, Object.hasOwn(stored, name) ? stored[name] : undefined);
  }
  return /** @type {CutoutBlock} */ (block);
}

/**
 * @param {{ cutout?: Partial<CutoutBlock> } | null | undefined} clip
 * @returns {boolean} True for a clip that is drawn through its matte
 */
export function hasCutout(clip) {
  return isPlainObject(clip?.cutout) && clip.cutout.on === true;
}

/**
 * Check a clip's `cutout` field for a document validator: absent, or
 * exactly what `normalizeCutout` produces.
 * @param {any} cutout
 * @param {string} path - Path of the field, e.g. `tracks[0].clips[2].cutout`
 * @param {Report} report
 */
export function checkCutout(cutout, path, report) {
  if (cutout === undefined) return;
  if (!isPlainObject(cutout)) return report(path, 'must be an object');
  const normal = normalizeCutout(cutout);
  for (const name of Object.keys(cutout)) {
    if (!Object.hasOwn(CUTOUT_FIELDS, name))
      report(`${path}.${name}`, 'is not a field of a cutout');
  }
  for (const [name, spec] of Object.entries(CUTOUT_FIELDS)) {
    if (cutout[name] === normal[name]) continue;
    const range = spec.type === 'number' ? `a number from ${spec.min} to ${spec.max}` : '';
    const choice = spec.options ? `one of: ${spec.options.join(', ')}` : 'true or false';
    report(`${path}.${name}`, `must be ${range || choice}`);
  }
}
