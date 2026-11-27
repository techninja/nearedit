/**
 * Blend modes — how a clip or a whole track combines with what is under it.
 * Each maps onto a canvas `globalCompositeOperation` that the browser and
 * the server canvas implement identically. Isomorphic and pure data.
 * @module utils/compose/blend
 */

/**
 * @typedef {Object} BlendMode
 * @property {string} id - Stored in `clip.blendMode` / `track.blendMode`
 * @property {string} label
 * @property {GlobalCompositeOperation} operation
 */

/** @type {BlendMode[]} */
export const BLEND_MODES = [
  { id: 'normal', label: 'Normal', operation: 'source-over' },
  { id: 'add', label: 'Add', operation: 'lighter' },
  { id: 'screen', label: 'Screen', operation: 'screen' },
  { id: 'multiply', label: 'Multiply', operation: 'multiply' },
  { id: 'overlay', label: 'Overlay', operation: 'overlay' },
  { id: 'darken', label: 'Darken', operation: 'darken' },
  { id: 'lighten', label: 'Lighten', operation: 'lighten' },
  { id: 'difference', label: 'Difference', operation: 'difference' },
  { id: 'soft-light', label: 'Soft light', operation: 'soft-light' },
];

/**
 * The composite operation for a stored blend mode; anything unknown is
 * `normal`.
 * @param {unknown} mode
 * @returns {GlobalCompositeOperation}
 */
export function compositeOperation(mode) {
  return BLEND_MODES.find((entry) => entry.id === mode)?.operation || 'source-over';
}

/**
 * @param {unknown} mode
 * @returns {boolean} True when the mode changes how a layer is composited
 */
export const isBlended = (mode) => compositeOperation(mode) !== 'source-over';
