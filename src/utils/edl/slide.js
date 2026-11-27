/**
 * The Vegas edits that change two things at once — slip-trim, roll and slide —
 * built from the plain trim, slip and move operations, so every limit those know
 * (source bounds, one frame minimum, cross-fades, locks, links) still holds. Pure.
 * @module utils/edl/slide
 */

import { slipClip } from './clipEdit.js';
import { isTimed } from './immutable.js';
import { moveClips } from './move.js';
import { findClip } from './query.js';
import { expandSelection } from './selection.js';
import { EPS, snap } from './time.js';
import { trimClipEnd, trimClipStart } from './trim.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {'start'|'end'} Edge */
/** @typedef {{ doc: Edl, moved: number }} Moved - A result and how far the edge or clip went */
/**
 * @typedef {{ sourceDurations?: import('./types.js').SourceDurations, linked?: boolean,
 *   autoCrossfade?: boolean }} SlideOptions - `linked` (default true): partners follow
 */

const TRIM = { start: trimClipStart, end: trimClipEnd };
/** @type {Record<Edge, Edge>} */
const FACING = { start: 'end', end: 'start' };

/** @type {(edl: Edl, clipId: string, edge: Edge) => number} Time of a clip's edge, NaN when gone. */
function edgeOf(edl, clipId, edge) {
  const clip = findClip(edl, clipId)?.clip;
  return clip ? (edge === 'start' ? clip.timelineStart : clip.timelineEnd) : NaN;
}

/** @type {(edl: Edl, clipId: string, edge: Edge, otherId: string) => number} Room between an
 * edge and the neighbour facing it: 0 when they touch, negative while they cross-fade. */
const gapAt = (edl, clipId, edge, otherId) =>
  (edgeOf(edl, otherId, FACING[edge]) - edgeOf(edl, clipId, edge)) * (edge === 'end' ? 1 : -1);

/** @type {(edl: Edl, clipId: string, edge: Edge, by: number, opts: SlideOptions) => Moved} Trim
 * an edge by an amount and report how far it really went. */
const nudgeEdge = (edl, clipId, edge, by, opts) => {
  const from = edgeOf(edl, clipId, edge);
  const doc = TRIM[edge](edl, clipId, from + by, { ...opts, ripple: false });
  return { doc, moved: edgeOf(doc, clipId, edge) - from };
};

/**
 * Slip-trim: drag an edge and the media travels with it. The other edge
 * stays where it is, the dragged edge keeps showing the same frame, and what
 * is trimmed comes off the far end of the source. Titles and stills just trim.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {Edge} edge
 * @param {number} time - Where the edge should go
 * @param {SlideOptions} [opts]
 * @returns {Edl}
 */
export function slipTrim(edl, clipId, edge, time, opts = {}) {
  const ref = findClip(edl, clipId);
  if (!ref || ref.track.locked || !Number.isFinite(time)) return edl;
  let by = snap(edl, time) - edgeOf(edl, clipId, edge);
  if (!isTimed(ref.clip, ref.track)) return nudgeEdge(edl, clipId, edge, by, opts).doc;
  if (edge === 'end' ? by <= 0 : by >= 0) {
    const trimmed = nudgeEdge(edl, clipId, edge, by, opts);
    return slipClip(trimmed.doc, clipId, -trimmed.moved, opts);
  }
  // Growing needs room in the source first, then on the timeline.
  for (let pass = 0; pass < 2; pass++) {
    const slipped = slipClip(edl, clipId, -by, opts);
    by = ref.clip.sourceIn - findClip(slipped, clipId).clip.sourceIn;
    const grown = nudgeEdge(slipped, clipId, edge, by, opts);
    if (Math.abs(grown.moved - by) < EPS) return grown.doc;
    by = grown.moved;
  }
  return edl;
}

/**
 * Roll: move the cut between a clip and the neighbour it touches or cross-fades
 * with. Their outer edges stay put. With no neighbour there it is a plain trim.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {Edge} edge - The edge of `clipId` that is dragged
 * @param {number} time - Where that edge should go
 * @param {SlideOptions} [opts]
 * @returns {Edl}
 */
export function rollEdit(edl, clipId, edge, time, opts = {}) {
  const ref = findClip(edl, clipId);
  if (!ref || ref.track.locked || !Number.isFinite(time)) return edl;
  let by = snap(edl, time) - edgeOf(edl, clipId, edge);
  const other = ref.track.clips[ref.clipIndex + (edge === 'start' ? -1 : 1)];
  const apart = !other || gapAt(edl, clipId, edge, other.clipId) > EPS;
  if (apart) return nudgeEdge(edl, clipId, edge, by, opts).doc;
  // The edge that gives way moves first, so the two clips never collide.
  const mine = { id: clipId, edge };
  const theirs = { id: other.clipId, edge: FACING[edge] };
  const [first, second] = (edge === 'end' ? by > 0 : by < 0) ? [theirs, mine] : [mine, theirs];
  for (let pass = 0; pass < 2; pass++) {
    const shrunk = nudgeEdge(edl, first.id, first.edge, by, opts);
    const grown = nudgeEdge(shrunk.doc, second.id, second.edge, shrunk.moved, opts);
    if (Math.abs(grown.moved - shrunk.moved) < EPS) return grown.doc;
    by = grown.moved;
  }
  return edl;
}

/** @type {(edl: Edl, clipId: string, by: number, opts: SlideOptions, probe: boolean) => Moved}
 * Slide one clip: the neighbour ahead gives way, the clip moves, the neighbour
 * behind follows. `probe` only measures how far that can go. */
const slideOne = (edl, clipId, by, opts, probe) => {
  const { clip, track, clipIndex } = findClip(edl, clipId);
  const forward = by > 0;
  const sides = [track.clips[clipIndex + 1], track.clips[clipIndex - 1]];
  const [ahead, behind] = forward ? sides : sides.reverse();
  /** @type {Edge[]} */
  const [lead, trail] = forward ? ['end', 'start'] : ['start', 'end'];
  const gap = (other, edge) => (other ? gapAt(edl, clipId, edge, other.clipId) : Infinity);
  const plain = { ...opts, linked: false };
  let room = forward ? by : Math.max(by, -clip.timelineStart);
  let doc = edl;
  if (gap(ahead, lead) <= EPS) {
    ({ doc, moved: room } = nudgeEdge(doc, ahead.clipId, FACING[lead], room, plain));
  } else room = Math.sign(by) * Math.min(Math.abs(room), gap(ahead, lead));
  const follows = gap(behind, trail) <= EPS;
  if (probe && follows) room = nudgeEdge(edl, behind.clipId, FACING[trail], room, plain).moved;
  if (probe) return { doc: edl, moved: room };
  doc = moveClips(doc, [clipId], { ...plain, delta: room, grouped: false });
  if (follows) doc = nudgeEdge(doc, behind.clipId, FACING[trail], room, plain).doc;
  return { doc, moved: room };
};

/**
 * Slide: move a clip, with what it shows, between its neighbours. A neighbour
 * it touches is trimmed to make room or to follow, so the clip keeps its length
 * and the neighbours their outer edges; across a gap it moves until they meet.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} delta - Seconds
 * @param {SlideOptions} [opts]
 * @returns {Edl}
 */
export function slideClip(edl, clipId, delta, opts = {}) {
  const ids = expandSelection(edl, [clipId], { linked: opts.linked !== false, grouped: false });
  if (!ids.includes(clipId) || !Number.isFinite(delta)) return edl;
  let by = snap(edl, delta);
  for (const id of ids) if (Math.abs(by) > EPS) by = slideOne(edl, id, by, opts, true).moved;
  if (Math.abs(by) < EPS) return edl;
  return ids.reduce((doc, id) => slideOne(doc, id, by, opts, false).doc, edl);
}
