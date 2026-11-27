/**
 * Builders for the entries of the particle schema, so that each parameter
 * reads as one line: its default, its range, its label.
 * @module utils/compose/generators/particles/spec
 */

/** @typedef {import('#utils/compose/params.js').ParamSpec} ParamSpec */

/**
 * A number that keeps the value it has for the whole clip.
 * @param {number} def - Default
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @param {Partial<ParamSpec>} [more] - `unit`, `step`, `when`
 * @returns {ParamSpec}
 */
export const fixed = (def, min, max, label, more = {}) => ({
  type: 'number',
  default: def,
  min,
  max,
  label,
  ...more,
});

/**
 * A number that may be keyframed.
 * @param {number} def
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @param {Partial<ParamSpec>} [more]
 * @returns {ParamSpec}
 */
export const num = (def, min, max, label, more = {}) =>
  fixed(def, min, max, label, { animatable: true, ...more });

/**
 * A share between 0 and 1 that may be keyframed.
 * @param {number} def
 * @param {string} label
 * @param {Partial<ParamSpec>} [more]
 * @returns {ParamSpec}
 */
export const share = (def, label, more = {}) => num(def, 0, 1, label, { step: 0.01, ...more });

/**
 * A colour that may be keyframed.
 * @param {string} def - Hex
 * @param {string} label
 * @param {Partial<ParamSpec>} [more]
 * @returns {ParamSpec}
 */
export const color = (def, label, more = {}) => ({
  type: 'color',
  default: def,
  label,
  animatable: true,
  ...more,
});

/**
 * One of a list; the first option is the default.
 * @param {string[]} options
 * @param {string} label
 * @param {Partial<ParamSpec>} [more]
 * @returns {ParamSpec}
 */
export const pick = (options, label, more = {}) => ({
  type: 'select',
  default: options[0],
  options,
  label,
  ...more,
});

/**
 * A switch.
 * @param {boolean} def
 * @param {string} label
 * @returns {ParamSpec}
 */
export const flag = (def, label) => ({ type: 'boolean', default: def, label });
