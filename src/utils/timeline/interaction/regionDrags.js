/**
 * Dragging a region in the ruler: its tag moves it, either end resizes it.
 * A click puts the cursor on the end that was clicked (the start, for the
 * tag).
 * @module utils/timeline/interaction/regionDrags
 */

import { regionsOf } from '#utils/edl/regions.js';
import { commit, getDoc } from '#utils/editor/session.js';
import { seek } from '#utils/playback/transport.js';
import { regionPreview } from '#utils/timeline/reduce/regions.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { dragCandidates, snapContext } from './press.js';

/** @typedef {import('./press.js').Gesture} Gesture */

/**
 * @param {'start'|'end'|'body'} part
 * @returns {Gesture}
 */
function regionGesture(part) {
  return {
    edits: true,
    autoScroll: true,
    begin(stage, press) {
      const { pps } = stage.geometry().vp;
      const skipRegion = press.hit.regionId;
      press.data.candidates = dragCandidates(press.base, { skipRegion, pps });
    },
    drag(stage, press) {
      const { vp } = stage.geometry();
      const delta = xToTimeRaw(vp, press.x) - press.time0;
      const drag = { regionId: press.hit.regionId, part, delta };
      const { doc, guide } = regionPreview(press.base, drag, snapContext(press, vp.pps));
      commit(doc);
      stage.overlay.guide = guide;
    },
    click(_stage, press) {
      const region = regionsOf(getDoc()).find((each) => each.regionId === press.hit.regionId);
      if (region) seek(part === 'end' ? region.end : region.start);
    },
  };
}

export const regionDrag = regionGesture('body');
export const regionStartDrag = regionGesture('start');
export const regionEndDrag = regionGesture('end');
