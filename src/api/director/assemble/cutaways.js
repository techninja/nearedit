/**
 * Cutaway placement — where a talking head jumps (two cuts of the same
 * speaker meeting on the main track, as left by pause removal), a short
 * piece of b-roll laid across the cut hides it.
 * @module api/director/assemble/cutaways
 */

import { toFrames } from '#utils/director/snap.js';

/** @typedef {import('./spine.js').SpineItem} SpineItem */

/**
 * Timeline frames where the picture jumps.
 * @param {SpineItem[]} items
 * @returns {{ atF: number, fromF: number, toF: number }[]} The cut, and how far a
 *   cutaway may reach to either side of it
 */
export function jumpCuts(items) {
  const pieces = items.flatMap((i) => i.pieces);
  const jumps = [];
  for (let i = 1; i < pieces.length; i++) {
    const [a, b] = [pieces[i - 1], pieces[i]];
    if (!a.cut.speech || !b.cut.speech || !a.hasPicture || !b.hasPicture) continue;
    if (a.cut.media !== b.cut.media) continue;
    jumps.push({ atF: b.startF, fromF: a.startF, toF: b.endF });
  }
  return jumps;
}

/**
 * Stretches of the timeline to cover with a cutaway: one across each jump
 * cut, starting a little before it, leaving the speaker on screen for at
 * least half a second at either end and two cutaway-lengths between them.
 * @param {SpineItem[]} items
 * @param {number} lengthF - Cutaway length, frames
 * @param {number} fps
 * @returns {[number, number][]}
 */
export function cutawayWindows(items, lengthF, fps) {
  const guardF = toFrames(0.5, fps);
  const windows = [];
  let lastEndF = -Infinity;
  for (const jump of jumpCuts(items)) {
    const startF = Math.max(
      jump.fromF + guardF,
      jump.atF - Math.round(lengthF * 0.4),
      lastEndF + 2 * lengthF,
    );
    const endF = Math.min(jump.toF - guardF, startF + lengthF);
    if (endF - startF < lengthF / 2 || startF >= jump.atF || endF <= jump.atF) continue;
    windows.push(/** @type {[number, number]} */ ([startF, endF]));
    lastEndF = endF;
  }
  return windows;
}
