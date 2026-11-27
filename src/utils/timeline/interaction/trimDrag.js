/**
 * Dragging a clip's edge (trim) and its fade handles.
 * @module utils/timeline/interaction/trimDrag
 */

import { expandSelection, findClip } from '#utils/edl/index.js';
import { commit } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { trimPreview } from '#utils/timeline/reduce/trim.js';
import { fadePreview } from '#utils/timeline/reduce/tweaks.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { clickClip, pressClip } from './clicks.js';
import { dragCandidates, snapContext } from './press.js';

/** @typedef {import('./press.js').Gesture} Gesture */
/** @typedef {import('./press.js').Press} Press */

/**
 * Where the pointer wants the grabbed edge or handle: its time at the
 * start of the drag plus how far the pointer has travelled, so the edge
 * does not jump to the pointer when grabbed a few pixels off.
 * @param {import('#utils/timeline/stage.js').Stage} stage
 * @param {Press} press
 * @returns {number} Seconds
 */
function grabbedTime(stage, press) {
  return press.data.from + (xToTimeRaw(stage.geometry().vp, press.x) - press.time0);
}

/**
 * @param {'start'|'end'} edge
 * @returns {Gesture}
 */
function trimGesture(edge) {
  return {
    edits: true,
    autoScroll: true,
    down: pressClip,
    begin(_stage, press) {
      const { clip } = findClip(press.base, press.hit.clipId);
      const { ripple, autoCrossfade } = getView();
      press.data.modes = { ripple, autoCrossfade };
      press.data.from = edge === 'start' ? clip.timelineStart : clip.timelineEnd;
      const trimmed = expandSelection(press.base, [clip.clipId], { grouped: false });
      press.data.candidates = dragCandidates(press.base, { exclude: trimmed });
    },
    drag(stage, press) {
      const snap = snapContext(press, stage.geometry().vp.pps);
      const drag = { clipId: press.hit.clipId, edge, time: grabbedTime(stage, press) };
      const modes = { ...press.data.modes, snapping: !!snap };
      const { doc, guide } = trimPreview(press.base, drag, modes, snap, sourceDurations());
      commit(doc);
      stage.overlay.guide = guide;
    },
    click: clickClip,
  };
}

/**
 * @param {'in'|'out'} edge
 * @returns {Gesture}
 */
function fadeGesture(edge) {
  return {
    edits: true,
    down: pressClip,
    begin(_stage, press) {
      const { clip } = findClip(press.base, press.hit.clipId);
      const inward =
        edge === 'in' ? clip.timelineStart + clip.fadeIn : clip.timelineEnd - clip.fadeOut;
      press.data.from = inward;
    },
    drag(stage, press) {
      commit(fadePreview(press.base, press.hit.clipId, edge, grabbedTime(stage, press)));
    },
    click: clickClip,
  };
}

export const trimStartDrag = trimGesture('start');
export const trimEndDrag = trimGesture('end');
export const fadeInDrag = fadeGesture('in');
export const fadeOutDrag = fadeGesture('out');
