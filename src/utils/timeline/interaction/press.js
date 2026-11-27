/**
 * Shared vocabulary of the pointer interactions: what a press is, what a
 * gesture module provides, and the helpers several gestures need (snap
 * context, snapping a clicked time).
 * @module utils/timeline/interaction/press
 */

import { snapCandidates, snapTime } from '#utils/edl/index.js';
import { beatSnapTimes } from '#utils/timeline/beats.js';
import { getDoc } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { getPosition } from '#utils/playback/transport.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/** How close, in pixels, an edge must come to snap. */
export const SNAP_PX = 8;

/**
 * One pointer press, from button down to button up.
 * @typedef {Object} Press
 * @property {number} pointerId
 * @property {string} pointerType - mouse, pen or touch
 * @property {import('#utils/timeline/gestureChoice.js').GestureName} gesture
 * @property {import('#utils/timeline/hitTest.js').Hit} hit - What was under the pointer at down
 * @property {import('#utils/timeline/gestureChoice.js').PointerInput} input - Buttons and modifiers at down
 * @property {number} x0 - Canvas x at down
 * @property {number} y0 - Canvas y at down
 * @property {number} x - Canvas x now
 * @property {number} y - Canvas y now
 * @property {number} time0 - Timeline time under the pointer at down (may be negative)
 * @property {number} scrollY0 - Vertical scroll at down
 * @property {boolean} shiftKey - Shift is held now (bypasses snapping)
 * @property {boolean} dragging - The pointer has travelled past the drag threshold
 * @property {number} [scrolling] - Animation frame id of the edge auto-scroll, 0 when idle
 * @property {any} base - Document the gesture started from (editing gestures)
 * @property {Record<string, any>} data - The gesture's own state
 */

/**
 * A gesture: what happens on press, while dragging and on release.
 * @typedef {Object} Gesture
 * @property {boolean} [edits] - Changes the document: the pointer module
 *   wraps the drag in `beginGesture()` … `endGesture()` and sets `press.base`
 * @property {boolean} [autoScroll] - Scroll when dragging near the edges
 * @property {(stage: Stage, press: Press) => void} [down] - At button down
 * @property {(stage: Stage, press: Press) => void} [begin] - When the drag starts
 * @property {(stage: Stage, press: Press) => void} [drag] - On every move
 * @property {(stage: Stage, press: Press) => void} [end] - Released after dragging
 * @property {(stage: Stage, press: Press) => void} [cancel] - Escape or a lost pointer
 * @property {(stage: Stage, press: Press) => void} [click] - Released without dragging
 */

/**
 * Snap candidates for a drag, built once when it starts: clip edges,
 * markers, the playhead, and the beats of music on the timeline.
 * @param {any} doc - Document the drag starts from
 * @param {{ exclude?: Iterable<string>, markers?: boolean, playhead?: boolean, pps?: number }} [opts] -
 *   `pps`: pixels per second now; beats are offered when it is given
 * @returns {import('#utils/edl/snap.js').SnapTarget[]}
 */
export function dragCandidates(doc, opts = {}) {
  const playhead = opts.playhead === false ? undefined : getPosition();
  const exclude = [...(opts.exclude || [])];
  const extra = opts.pps ? beatSnapTimes(doc, opts.pps, { exclude }) : [];
  return snapCandidates(doc, { exclude, markers: opts.markers, playhead, extra });
}

/**
 * The snap context of this moment of a drag, or undefined when snapping is
 * off (or bypassed by holding Shift).
 * @param {Press} press
 * @param {number} pps - Pixels per second now
 * @returns {import('#utils/timeline/reduce/move.js').SnapContext|undefined}
 */
export function snapContext(press, pps) {
  if (!getView().snapping || press.shiftKey || !press.data.candidates) return undefined;
  return { threshold: SNAP_PX / pps, candidates: press.data.candidates };
}

/**
 * Snap a pointed-at time (a click, a scrub, a drop) to clip edges,
 * markers and beats when snapping is on.
 * @param {number} time
 * @param {number} pps
 * @param {boolean} [bypass] - Shift is held
 * @returns {{ time: number, guide: number|null }}
 */
export function snapPoint(time, pps, bypass = false) {
  if (!getView().snapping || bypass) return { time, guide: null };
  const extra = beatSnapTimes(getDoc(), pps);
  const hit = snapTime(getDoc(), time, { threshold: SNAP_PX / pps, extra });
  return { time: hit.time, guide: hit.snapped ? hit.time : null };
}
