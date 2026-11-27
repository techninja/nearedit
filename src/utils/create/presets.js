/**
 * Presets of a generator or an effect, as the catalog lists them
 * (`presets` on a catalog entry or on the module): `{ id, name | label,
 * description, params, seed?, blendMode? }`, where `params` holds only
 * what differs from the defaults and `blendMode` is the blend mode to give
 * the inserted clip. Pure and isomorphic.
 * @module utils/create/presets
 */

/**
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {Record<string, any>} params - What differs from the defaults
 * @property {number} [seed]
 * @property {string} [blendMode] - Blend mode that suits the layer over a picture
 */

/**
 * Clean a list of presets; anything without a name is left out.
 * @param {any} list
 * @returns {Preset[]}
 */
export function normalizePresets(list) {
  return (Array.isArray(list) ? list : [])
    .map((preset, index) => ({ preset, index, label: preset?.label || preset?.name }))
    .filter(({ label }) => typeof label === 'string' && label)
    .map(({ preset, index, label }) => ({
      id: String(preset.id || index),
      label,
      description: typeof preset.description === 'string' ? preset.description : '',
      params: preset.params && typeof preset.params === 'object' ? preset.params : {},
      ...(Number.isFinite(preset.seed) && { seed: preset.seed }),
      ...(typeof preset.blendMode === 'string' && { blendMode: preset.blendMode }),
    }));
}

/**
 * @param {any} entry - A catalog entry or a module; anything without
 *   presets has none
 * @returns {Preset[]}
 */
export const presetsOf = (entry) => normalizePresets(entry?.presets);
