/**
 * The Vegas modifier drags as pure functions: slip-trim (Alt on an edge),
 * roll (Ctrl+Alt on an edge) and slide (Ctrl+Alt on the body), each with
 * snapping and a guide like the plain trim and move.
 * @module utils/timeline/reduce/slide
 */

import { findClip, snapMove, snapTime } from '#utils/edl/index.js';
import { rollEdit, slideClip, slipTrim } from '#utils/edl/slide.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {{ clipId: string, edge: 'start'|'end', time: number }} EdgeDrag */
/** @typedef {{ doc: Edl, guide: number|null }} Preview */

/** Two times closer than this are the same place on the frame grid. */
const SAME_TIME = 1e-4;

/**
 * @param {(edl: Edl, clipId: string, edge: 'start'|'end', time: number, opts: object) => Edl} operation
 * @returns {(base: Edl, drag: EdgeDrag, modes: import('./move.js').EditModes,
 *   snap?: import('./move.js').SnapContext,
 *   sourceDurations?: import('#utils/edl/types.js').SourceDurations) => Preview} A preview
 *   function: the document an edge drag shows at this moment, and the snap
 *   target the edge landed on (null when a limit stopped it short)
 */
function edgePreview(operation) {
  return (base, drag, modes, snap, sourceDurations) => {
    const hit = modes.snapping && snap ? snapTime(base, drag.time, snap) : null;
    const time = hit?.snapped ? hit.time : drag.time;
    const opts = { sourceDurations, autoCrossfade: modes.autoCrossfade };
    const doc = operation(base, drag.clipId, drag.edge, time, opts);
    const clip = findClip(doc, drag.clipId)?.clip;
    const at = clip ? (drag.edge === 'start' ? clip.timelineStart : clip.timelineEnd) : NaN;
    return { doc, guide: hit?.snapped && Math.abs(at - time) < SAME_TIME ? time : null };
  };
}

/** Alt-drag an edge: the media travels with it (`slipTrim`). */
export const slipTrimPreview = edgePreview(slipTrim);

/** Ctrl+Alt-drag an edge: the cut between two clips moves (`rollEdit`). */
export const rollPreview = edgePreview(rollEdit);

/**
 * Ctrl+Alt-drag a clip: it slides between its neighbours (`slideClip`).
 * @param {Edl} base - Document the drag started from
 * @param {{ clipId: string, delta: number }} drag
 * @param {import('./move.js').EditModes} modes
 * @param {import('./move.js').SnapContext} [snap]
 * @param {import('#utils/edl/types.js').SourceDurations} [sourceDurations]
 * @returns {Preview}
 */
export function slidePreview(base, drag, modes, snap, sourceDurations) {
  const { clipId } = drag;
  const hit = modes.snapping && snap ? snapMove(base, [clipId], drag.delta, snap) : null;
  const delta = hit?.snapped ? hit.delta : drag.delta;
  const doc = slideClip(base, clipId, delta, {
    sourceDurations,
    autoCrossfade: modes.autoCrossfade,
  });
  const before = findClip(base, clipId)?.clip;
  const after = findClip(doc, clipId)?.clip;
  const landed = before && after && Math.abs(after.timelineStart - before.timelineStart - delta);
  return { doc, guide: hit?.snapped && landed < SAME_TIME ? hit.target.time : null };
}
