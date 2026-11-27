/**
 * Which clip is under the pointer in the preview. Layers are tried from
 * the front of the picture to the back, with the same stacking, mute and
 * solo rules the compositor draws by. Pure and isomorphic.
 * @module utils/preview/hit
 */

import { layersAt } from '#utils/compose/layers.js';
import { boxContains } from './boxQuery.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./geometry.js').Box} Box */

/**
 * The layers of the frame that can be picked, front first. Clips on locked
 * tracks cannot be selected, so they are left out.
 * @param {{ tracks?: any[] }} edl
 * @param {number} time - Timeline seconds
 * @returns {import('#utils/compose/layers.js').Layer[]}
 */
export function pickableLayers(edl, time) {
  return layersAt(edl, time)
    .filter((layer) => !layer.track.locked)
    .reverse();
}

/**
 * The front-most clip whose box holds a point.
 * @param {{ tracks?: any[] }} edl
 * @param {number} time
 * @param {Point} point - Output pixels
 * @param {(layer: import('#utils/compose/layers.js').Layer) => Box|null} boxOf -
 *   The box of a layer (the overlay knows source sizes and text extents)
 * @param {{ beneath?: string, slack?: number }} [opts] - `beneath`: skip
 *   down to what lies under this clip (click through); `slack`: extra reach
 *   around each box, output pixels
 * @returns {string} Clip id, or '' when nothing is there
 */
export function clipAtPoint(edl, time, point, boxOf, opts = {}) {
  const hits = pickableLayers(edl, time).filter((layer) => {
    const box = boxOf(layer);
    return Boolean(box) && boxContains(box, point, opts.slack || 0);
  });
  if (!hits.length) return '';
  const from = hits.findIndex((layer) => layer.clip.clipId === opts.beneath);
  // Past the last layer the click wraps round to the front again.
  return hits[(from + 1) % hits.length].clip.clipId;
}
