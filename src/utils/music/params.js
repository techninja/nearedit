/**
 * What a synth part's parameters come to: the table's defaults, the
 * preset's values on top, the part's own on top of those — every value
 * coerced to its type and range. Isomorphic and pure.
 * @module utils/music/params
 */

import { coerceParam } from '#utils/compose/params.js';
import { own, record } from '#utils/web/coerce.js';
import { DEFAULT_PRESET, PRESETS } from './catalog/presets.js';
import { SYNTH_PARAMS, WHOLE_PARAMS } from './catalog/synthParams.js';

/**
 * One value as the table wants it.
 * @param {string} name - A parameter of `SYNTH_PARAMS`
 * @param {any} value
 * @param {any} [fallback] - What an unusable value becomes; the table's
 *   default when left out
 * @returns {any}
 */
export function paramValue(name, value, fallback) {
  const spec = SYNTH_PARAMS[name];
  const coerced = coerceParam(
    fallback === undefined ? spec : { ...spec, default: fallback },
    value,
  );
  return WHOLE_PARAMS.includes(name) ? Math.round(coerced) : coerced;
}

/**
 * @param {any} name
 * @returns {string} The preset's name when it exists, else the default preset's
 */
export function presetName(name) {
  return typeof name === 'string' && Object.hasOwn(PRESETS, name) ? name : DEFAULT_PRESET;
}

/**
 * Every parameter of a preset with its value.
 * @param {any} name - A preset; an unknown one counts as the default preset
 * @returns {Record<string, any>}
 */
export function presetParams(name) {
  const { params } = PRESETS[presetName(name)];
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(SYNTH_PARAMS)) {
    out[key] = paramValue(key, Object.hasOwn(params, key) ? params[key] : undefined);
  }
  return out;
}

/**
 * Every parameter of a synth part with the value the engine plays.
 * @param {any} part - `{ preset, params }`; need not be normalised
 * @returns {Record<string, any>}
 */
export function partParams(part) {
  const from = record(part);
  const out = presetParams(own(from, 'preset'));
  const stored = record(own(from, 'params'));
  for (const key of Object.keys(SYNTH_PARAMS)) {
    if (Object.hasOwn(stored, key)) out[key] = paramValue(key, stored[key], out[key]);
  }
  return out;
}
