/**
 * Hit-testing regions in the ruler: either end of a region can be grabbed
 * anywhere in the ruler's time band (like a marker), its body only on the
 * row of tags, so the tick row below stays free for scrubbing. Pure.
 * @module utils/timeline/hitRuler
 */

import { LOOP_BAND_H, MARK_ROW_H } from './layout.js';
import { timeToX } from './viewport.js';

/**
 * @param {import('./hitTest.js').Geometry} geo
 * @param {number} x - Canvas x
 * @param {number} y - Canvas y, inside the ruler's time band
 * @param {number} reach - How near an end must be, pixels
 * @returns {{ regionId: string, regionPart: 'start'|'end'|'body' }|null}
 */
export function regionAt(geo, x, y, reach) {
  const regions = /** @type {any} */ (geo.doc).regions || [];
  /** @type {{ regionId: string, regionPart: 'start'|'end'|'body' }|null} */
  let best = null;
  let distance = reach;
  for (const region of regions) {
    for (const part of /** @type {('start'|'end')[]} */ (['start', 'end'])) {
      const gap = Math.abs(timeToX(geo.vp, region[part]) - x);
      if (gap > distance) continue;
      distance = gap;
      best = { regionId: region.regionId, regionPart: part };
    }
  }
  if (best || y > LOOP_BAND_H + MARK_ROW_H) return best;
  const inside = (region) => x > timeToX(geo.vp, region.start) && x < timeToX(geo.vp, region.end);
  // Of nested regions the shortest is the one pointed at.
  const under = regions.filter(inside).sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  return under ? { regionId: under.regionId, regionPart: 'body' } : null;
}
