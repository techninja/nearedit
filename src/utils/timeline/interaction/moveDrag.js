/**
 * Dragging clip bodies: move in time and to another track of the same
 * type, with linked and grouped partners — or, with Alt held, slip the
 * source under the clip.
 * @module utils/timeline/interaction/moveDrag
 */

import { commit } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { nearestLane } from '#utils/timeline/layout.js';
import { movePreview, movingClips } from '#utils/timeline/reduce/move.js';
import { slipPreview } from '#utils/timeline/reduce/tweaks.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { clickClip, pressClip } from './clicks.js';
import { dragCandidates, snapContext } from './press.js';

/** @typedef {import('./press.js').Gesture} Gesture */

/** @type {Gesture} */
export const moveDrag = {
  edits: true,
  autoScroll: true,
  down: pressClip,
  begin(_stage, press) {
    const { ripple, autoCrossfade } = getView();
    press.data.modes = { ripple, autoCrossfade };
    const moving = movingClips(press.base, press.data.clipIds, ripple);
    press.data.candidates = dragCandidates(press.base, { exclude: moving });
  },
  drag(stage, press) {
    const { vp, lanes } = stage.geometry();
    const snap = snapContext(press, vp.pps);
    const drag = {
      clipIds: press.data.clipIds,
      anchorId: press.hit.clipId,
      delta: xToTimeRaw(vp, press.x) - press.time0,
      toTrackId: nearestLane(lanes, press.y, vp.scrollY)?.trackId,
    };
    const modes = { ...press.data.modes, snapping: !!snap };
    const { doc, guide } = movePreview(press.base, drag, modes, snap);
    commit(doc);
    stage.overlay.guide = guide;
  },
  click: clickClip,
};

/** @type {Gesture} */
export const slipDrag = {
  edits: true,
  down: pressClip,
  drag(stage, press) {
    const delta = xToTimeRaw(stage.geometry().vp, press.x) - press.time0;
    commit(slipPreview(press.base, press.hit.clipId, delta, sourceDurations()));
  },
  click: clickClip,
};
