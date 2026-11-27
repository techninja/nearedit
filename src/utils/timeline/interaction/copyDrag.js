/**
 * Ctrl-drag a clip: the clips stay and copies go with the pointer (to
 * another track of the same kind too). On release the copies are selected.
 * @module utils/timeline/interaction/copyDrag
 */

import { rippled } from '#utils/commands/postRipple.js';
import { newClipIds } from '#utils/edl/index.js';
import { commit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { nearestLane } from '#utils/timeline/layout.js';
import { copyPreview } from '#utils/timeline/reduce/copy.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { clickClip, pressClip } from './clicks.js';
import { dragCandidates, snapContext } from './press.js';

/** @type {import('./press.js').Gesture} */
export const copyDrag = {
  edits: true,
  autoScroll: true,
  down: pressClip,
  begin(stage, press) {
    const { ripple, autoCrossfade } = getView();
    press.data.modes = { ripple, autoCrossfade };
    // The originals stay put, but a copy should not snap onto its own source.
    const { pps } = stage.geometry().vp;
    press.data.candidates = dragCandidates(press.base, { exclude: press.data.clipIds, pps });
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
    const { doc, guide } = copyPreview(press.base, drag, modes, snap);
    commit(modes.ripple ? rippled(press.base, doc) : doc);
    stage.overlay.guide = guide;
  },
  end(_stage, press) {
    const copies = newClipIds(press.base, getDoc());
    if (copies.length) setSelection(copies, { expand: false });
  },
  click: clickClip,
};
