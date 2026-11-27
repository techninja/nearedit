/**
 * Dragging in the ruler: scrub the playhead, set the loop region, move a
 * marker.
 * @module utils/timeline/interaction/rulerDrags
 */

import { commit, getDoc } from '#utils/editor/session.js';
import { seek, setLoopRange } from '#utils/playback/transport.js';
import { markerPreview } from '#utils/timeline/reduce/tweaks.js';
import { xToTime, xToTimeRaw } from '#utils/timeline/viewport.js';
import { dragCandidates, snapContext, snapPoint } from './press.js';

/** @typedef {import('./press.js').Gesture} Gesture */
/** @typedef {import('./press.js').Press} Press */
/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * The time under the pointer, snapped to clip edges and markers when
 * snapping is on; the snap guide is shown.
 * @param {Stage} stage
 * @param {Press} press
 * @param {boolean} [bypass] - Ignore snapping
 * @returns {number}
 */
function pointedTime(stage, press, bypass = false) {
  const { vp } = stage.geometry();
  const { time, guide } = snapPoint(xToTime(vp, press.x), vp.pps, bypass);
  stage.overlay.guide = guide;
  return time;
}

/** @type {Gesture} Scrub: the playhead follows the pointer from the first touch. */
export const scrubDrag = {
  autoScroll: true,
  down: (stage, press) => seek(pointedTime(stage, press)),
  drag: (stage, press) => seek(pointedTime(stage, press)),
};

/**
 * @type {Gesture} Loop region: drag across the loop band (or Shift-drag in
 *   the ruler). A click without a drag clears the region.
 */
export const loopDrag = {
  autoScroll: true,
  begin(stage, press) {
    const { vp } = stage.geometry();
    press.data.from = snapPoint(Math.max(0, press.time0), vp.pps).time;
  },
  // Shift may be what started this drag, so it cannot also bypass snapping.
  drag: (stage, press) => setLoopRange(press.data.from, pointedTime(stage, press)),
  click: () => setLoopRange(0, 0),
};

/** @type {Gesture} Marker: drag to move (snapping to clip edges), click to go there. */
export const markerDrag = {
  edits: true,
  autoScroll: true,
  begin(_stage, press) {
    const marker = press.base.markers.find((m) => m.markerId === press.hit.markerId);
    press.data.from = marker ? marker.time : press.hit.time;
    press.data.candidates = dragCandidates(press.base, { markers: false });
  },
  drag(stage, press) {
    const { vp } = stage.geometry();
    const snap = snapContext(press, vp.pps);
    // The marker travels as far as the pointer has, wherever its flag was grabbed.
    const time = Math.max(0, press.data.from + xToTimeRaw(vp, press.x) - press.time0);
    const { doc, guide } = markerPreview(press.base, press.hit.markerId, time, !!snap, snap);
    commit(doc);
    stage.overlay.guide = guide;
  },
  click(_stage, press) {
    const marker = (getDoc().markers || []).find((m) => m.markerId === press.hit.markerId);
    if (marker) seek(marker.time);
  },
};
