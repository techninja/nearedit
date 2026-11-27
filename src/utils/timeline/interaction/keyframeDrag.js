/**
 * The keyframe marks on a clip: a click moves the playhead to the mark,
 * a drag retimes every key the clip has there (one undo step).
 * @module utils/timeline/interaction/keyframeDrag
 */

import { commit } from '#utils/editor/session.js';
import { seek } from '#utils/playback/transport.js';
import { keyframePreview } from '#utils/timeline/reduce/keyframes.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { pressClip, unpressClip } from './clicks.js';
import { snapPoint } from './press.js';

/** @type {import('./press.js').Gesture} */
export const keyframeDrag = {
  edits: true,
  autoScroll: true,
  down(stage, press) {
    pressClip(stage, press);
    stage.overlay.keyMark = { clipId: press.hit.clipId, time: press.hit.keyTime };
    stage.invalidate();
  },
  drag(stage, press) {
    const { vp } = stage.geometry();
    const wanted = press.hit.keyTime + (xToTimeRaw(vp, press.x) - press.time0);
    const snapped = snapPoint(wanted, vp.pps, press.shiftKey);
    const { doc, time } = keyframePreview(
      press.base,
      press.hit.clipId,
      press.hit.keyTime,
      snapped.time,
    );
    commit(doc);
    stage.overlay.keyMark = { clipId: press.hit.clipId, time };
    stage.overlay.guide = snapped.guide === time ? snapped.guide : null;
  },
  end(stage) {
    stage.overlay.keyMark = null;
    stage.overlay.guide = null;
    stage.invalidate();
  },
  cancel(stage, press) {
    stage.overlay.keyMark = null;
    unpressClip(stage, press);
  },
  click(stage, press) {
    stage.overlay.keyMark = null;
    seek(press.hit.keyTime);
    stage.invalidate();
  },
};
