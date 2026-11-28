/**
 * What a preset is, and how one is written down. Isomorphic and pure.
 * @module utils/music/catalog/presets/preset
 */

/**
 * A named corner of the synth: only a set of parameter values.
 * @typedef {Object} Preset
 * @property {string} name - What a part's `preset` holds
 * @property {string} label
 * @property {string} description
 * @property {'bass'|'keys'|'pad'|'lead'} category
 * @property {Record<string, any>} params - What differs from the defaults
 *   of `SYNTH_PARAMS`
 */

/**
 * @param {string} name
 * @param {string} label
 * @param {Preset['category']} category
 * @param {string} description
 * @param {Record<string, any>} params
 * @returns {Preset}
 */
export function preset(name, label, category, description, params) {
  return Object.freeze({ name, label, description, category, params: Object.freeze(params) });
}
