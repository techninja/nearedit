/**
 * The modifier drags on a clip: Alt on an edge slip-trims, Ctrl+Alt on an
 * edge rolls the cut with the neighbouring clip, Ctrl+Alt on the body
 * slides the clip between its neighbours.
 * @module utils/timeline/interaction/slideDrags
 */

import { rippled } from '#utils/commands/postRipple.js';
import { expandSelection, findClip } from '#utils/edl/index.js';
import { commit } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { rollPreview, slidePreview, slipTrimPreview } from '#utils/timeline/reduce/slide.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { clickClip, pressClip } from './clicks.js';
import { dragCandidates, snapContext } from './press.js';

/** @typedef {import('./press.js').Gesture} Gesture */
/** @typedef {import('./press.js').Press} Press */
/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * What every one of these drags sets up when it starts.
 * @param {Stage} stage
 * @param {Press} press
 * @returns {any} The grabbed clip
 */
function begin(stage, press) {
  const { clip } = findClip(press.base, press.hit.clipId);
  const { ripple, autoCrossfade } = getView();
  press.data.modes = { ripple, autoCrossfade };
  const own = expandSelection(press.base, [clip.clipId], { grouped: false });
  const { pps } = stage.geometry().vp;
  press.data.candidates = dragCandidates(press.base, { exclude: own, pps });
  return clip;
}

/**
 * Show a preview; with auto ripple on, what follows the edit goes along.
 * @param {Stage} stage
 * @param {Press} press
 * @param {{ doc: any, guide: number|null }} preview
 */
function show(stage, press, { doc, guide }) {
  commit(press.data.modes.ripple ? rippled(press.base, doc) : doc);
  stage.overlay.guide = guide;
}

/**
 * @param {'start'|'end'} edge
 * @param {typeof rollPreview} preview
 * @returns {Gesture}
 */
function edgeGesture(edge, preview) {
  return {
    edits: true,
    autoScroll: true,
    down: pressClip,
    begin(stage, press) {
      const clip = begin(stage, press);
      press.data.from = edge === 'start' ? clip.timelineStart : clip.timelineEnd;
    },
    drag(stage, press) {
      const { vp } = stage.geometry();
      const snap = snapContext(press, vp.pps);
      const time = press.data.from + (xToTimeRaw(vp, press.x) - press.time0);
      const modes = { ...press.data.modes, snapping: !!snap };
      const drag = { clipId: press.hit.clipId, edge, time };
      show(stage, press, preview(press.base, drag, modes, snap, sourceDurations()));
    },
    click: clickClip,
  };
}

export const slipTrimStartDrag = edgeGesture('start', slipTrimPreview);
export const slipTrimEndDrag = edgeGesture('end', slipTrimPreview);
export const rollStartDrag = edgeGesture('start', rollPreview);
export const rollEndDrag = edgeGesture('end', rollPreview);

/** @type {Gesture} */
export const slideDrag = {
  edits: true,
  autoScroll: true,
  down: pressClip,
  begin,
  drag(stage, press) {
    const { vp } = stage.geometry();
    const snap = snapContext(press, vp.pps);
    const drag = { clipId: press.hit.clipId, delta: xToTimeRaw(vp, press.x) - press.time0 };
    const modes = { ...press.data.modes, snapping: !!snap };
    show(stage, press, slidePreview(press.base, drag, modes, snap, sourceDurations()));
  },
  click: clickClip,
};
