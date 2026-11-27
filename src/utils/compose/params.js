/**
 * Parameter resolution — what a generator or an effect actually receives.
 * A document stores only the parameters that were changed; everything else
 * comes from the module's schema. Stored values are untrusted (hand-written
 * JSON, an LLM, an older version), so each one is coerced to its declared
 * type and range, and falls back to the default when it cannot be used.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § Module contracts.
 * @module utils/compose/params
 */

import { isHex } from './color.js';

/**
 * One parameter of a generator or effect.
 * @typedef {Object} ParamSpec
 * @property {'number'|'color'|'boolean'|'select'|'text'|'image'|'point'} type
 * @property {any} default
 * @property {string} [label] - Shown beside the control
 * @property {number} [min] - number
 * @property {number} [max] - number
 * @property {number} [step] - number
 * @property {string} [unit] - number: `px` (output pixels), `°`, `s`, `%`…
 * @property {string[]} [options] - select
 * @property {boolean} [animatable] - May be keyframed
 * @property {Record<string, any>} [when] - Hint for editors: show this
 *   control only while another parameter has one of the listed values,
 *   `{ shape: ['star'] }`
 */

/** @typedef {Record<string, ParamSpec>} ParamSchema */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number} A finite number
 */
function finite(value, fallback) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * One stored value as its schema type.
 * @param {ParamSpec} spec
 * @param {unknown} value
 * @returns {any}
 */
export function coerceParam(spec, value) {
  const fallback = spec.default;
  switch (spec.type) {
    case 'number': {
      const n = finite(value, fallback);
      return Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, n));
    }
    case 'color':
      return isHex(value) ? value : fallback;
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 'true' ? true : value === 'false' ? false : fallback;
    case 'select':
      return (spec.options || []).includes(/** @type {string} */ (value)) ? value : fallback;
    case 'point': {
      const point = /** @type {any} */ (value && typeof value === 'object' ? value : {});
      return { x: finite(point.x, fallback?.x ?? 0.5), y: finite(point.y, fallback?.y ?? 0.5) };
    }
    default:
      return typeof value === 'string' ? value : fallback;
  }
}

/**
 * Every parameter of a schema with its value: the stored one where it is
 * usable, the default otherwise. Keys the schema does not declare are left
 * out.
 * @param {ParamSchema|undefined} schema
 * @param {Record<string, any>|undefined} stored
 * @returns {Record<string, any>}
 */
export function resolveParams(schema, stored) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const name of Object.keys(schema || {})) {
    out[name] = coerceParam(schema[name], stored?.[name]);
  }
  return out;
}

/**
 * The image paths a parameter bag refers to (parameters of type `image`
 * that are set).
 * @param {ParamSchema|undefined} schema
 * @param {Record<string, any>|undefined} stored
 * @returns {string[]}
 */
export function imageParams(schema, stored) {
  return Object.keys(schema || {})
    .filter((name) => schema[name].type === 'image')
    .map((name) => coerceParam(schema[name], stored?.[name]))
    .filter((path) => typeof path === 'string' && path !== '');
}
