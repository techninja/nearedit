/**
 * The settings of a clip's `cutout` block as data: its fields with their
 * defaults and limits — an inspector is generated from the table — and
 * reading them from whatever a file or a language model holds. The whole
 * block, with what was made for it, is `block.js`. Isomorphic and pure.
 * Contract: docs/app-spec/CUTOUT.md § In the document.
 * @module utils/cutout/fields
 */

import { coerceParam } from '#utils/compose/params.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';

/** @typedef {import('./types.js').CutoutBlock} CutoutBlock */

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
 * Read the settings of a `cutout` block: every field of the table, each
 * the stored value when it is usable — of the right type, numbers held
 * inside their limits — and the default otherwise. Everything else a block
 * holds (unknown fields, and `made`) is left out.
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
