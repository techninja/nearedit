/**
 * Dragging a region in the ruler as a pure function: its body moves it,
 * either end resizes it, and the dragged ends snap like a marker does.
 * @module utils/timeline/reduce/regions
 */

import { snapEdges, snapTime } from '#utils/edl/index.js';
import { moveRegion, regionsOf, resizeRegion } from '#utils/edl/regions.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} RegionDrag
 * @property {string} regionId
 * @property {'start'|'end'|'body'} part - What was grabbed
 * @property {number} delta - Seconds the pointer has travelled
 */

/**
 * The document a region drag shows at this moment.
 * @param {Edl} base - Document the drag started from
 * @param {RegionDrag} drag
 * @param {import('./move.js').SnapContext} [snap] - Omit to ignore snapping
 * @returns {{ doc: Edl, guide: number|null }}
 */
export function regionPreview(base, drag, snap) {
  const region = regionsOf(base).find((each) => each.regionId === drag.regionId);
  if (!region) return { doc: base, guide: null };
  if (drag.part === 'body') {
    const [start, end] = [region.start + drag.delta, region.end + drag.delta];
    const hit = snap ? snapEdges(base, start, end, snap) : null;
    const doc = moveRegion(base, region.regionId, hit?.snapped ? hit.start : start);
    return { doc, guide: hit?.snapped ? hit.target.time : null };
  }
  const time = region[drag.part] + drag.delta;
  const hit = snap ? snapTime(base, time, snap) : null;
  const doc = resizeRegion(base, region.regionId, drag.part, hit?.snapped ? hit.time : time);
  return { doc, guide: hit?.snapped ? hit.time : null };
}
