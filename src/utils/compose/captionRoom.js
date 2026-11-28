/**
 * Room for captions among brand overlays. A lower third and the captions
 * are both put at the foot of the frame by NearEdit itself; where an
 * overlay would be in a caption group's way, the group is drawn clear of it
 * (`#utils/captions/room.js` has the rule, `overlayBlocks.js` what is in
 * the way). Here the answer is worked out **once per group** and kept:
 *
 * - from everything that is in the way at any moment the group is on
 *   screen, so the group is in one place from its first frame to its last;
 * - in the output's own pixels, so a small preview, the render, the server
 *   canvas and a browser all move it by the same share of the frame;
 * - by document and group. Documents are never changed in place, so an
 *   answer holds for as long as the document is the same object, and a
 *   frame of a group that was decided costs a few lookups. A document
 *   without overlays costs one.
 * Isomorphic. Reference: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/compose/captionRoom
 */

import { placeCaption } from '#utils/captions/drawAt.js';
import { liftFor } from '#utils/captions/room.js';
import { pictureSizes } from './elementExpansion.js';
import { blocksDuring, overlayClips } from './overlayBlocks.js';

/**
 * @typedef {import('./drawClip.js').FrameRun} FrameRun
 * @typedef {{ lane: number, from: number, to: number }} When - The lane a
 *   group is drawn in, and the stretch of the timeline it is on screen for
 * @typedef {When & { lift: number, width: number, height: number,
 *   pictures: import('./overlayBlocks.js').Blocks['pictures'] }} Decision - An
 *   answer, and what it was worked out from
 */

/** @type {WeakMap<object, { clips: any[], decided: WeakMap<object, Decision[]> }>} By document */
const rooms = new WeakMap();

/**
 * @param {Decision|undefined} known
 * @param {When} when
 * @param {FrameRun} run
 * @returns {boolean} True while an answer still holds
 */
function holds(known, when, run) {
  return (
    known !== undefined &&
    known.width === run.frame.outWidth &&
    known.height === run.frame.outHeight &&
    known.from === when.from &&
    known.to === when.to &&
    known.pictures.every(([element, sizes]) => pictureSizes(element, run) === sizes)
  );
}

/**
 * How far a caption group is moved to be clear of the brand overlays that
 * are in its way while it is on screen.
 * @param {import('#utils/captions/types.js').CaptionGroup} group - The group on screen
 * @param {When} when
 * @param {import('#utils/captions/types.js').CaptionStyle} style - Resolved
 * @param {FrameRun} run
 * @param {any} ctx - Any context of this host, to measure text with
 * @returns {number} Units to sit lower by (negative: higher) — the `lift`
 *   of `drawCaptionAt` — the same at every frame of the group; 0 when
 *   nothing is in its way
 */
export function captionLift(group, when, style, run, ctx) {
  const { edl, frame } = run;
  let room = rooms.get(edl);
  if (!room) rooms.set(edl, (room = { clips: overlayClips(edl), decided: new WeakMap() }));
  if (!room.clips.length) return 0;
  let lanes = room.decided.get(group);
  if (!lanes) room.decided.set(group, (lanes = []));
  const known = lanes[when.lane];
  if (holds(known, when, run)) return known.lift;
  const { rects, pictures, settled } = blocksDuring(room.clips, when.from, when.to, run, ctx);
  // The group in its normal place, in a frame of the output's own size.
  const out = { width: frame.outWidth, height: frame.outHeight, fonts: frame.fonts };
  const lift = rects.length
    ? liftFor(placeCaption(ctx, group, style, out, when.lane), rects, style, out)
    : 0;
  // Measured before a font arrived, an answer is not one to keep.
  if (settled) lanes[when.lane] = { ...when, lift, width: out.width, height: out.height, pictures };
  return lift;
}
