/**
 * Room for a caption — where a group goes when something else NearEdit drew
 * is in its place: a lower third, a logo bug, any brand overlay. The group
 * is moved clear of it — above it for a caption at the bottom, below it for
 * one at the top — and never sideways: captions stay centred. The move is
 * worked out once for a group, from the group at rest and from everything
 * that is in its way at any moment the group is on screen, so a caption
 * never jumps while it is being read. Pure: rectangles in, a distance out.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/room
 */

import { SAFE } from './metrics.js';

/** @typedef {import('./types.js').Rect} Rect */

/**
 * How near something may come before it is in a caption's way, units:
 * beside the caption, on its own line of sight, and above or below it.
 */
export const ROOM = Object.freeze({ beside: 6, above: 2 });

/** Two edges this close, canvas pixels, touch rather than overlap. */
const TOUCH = 1e-6;

/**
 * The rectangle a group fills at rest: its lines and the room its style
 * needs around them — the plate, whether it is drawn or not.
 * @param {{ box: Rect, room: { x: number, top: number, bottom: number } }} placed -
 *   From `placeWords`
 * @returns {Rect}
 */
export function restRect(placed) {
  const { box, room } = placed;
  return {
    x: box.x - room.x,
    y: box.y - room.top,
    width: box.width + 2 * room.x,
    height: box.height + room.top + room.bottom,
  };
}

/**
 * @param {Rect} rect - The caption
 * @param {number} dy - How far it has been moved down
 * @param {Rect} block
 * @param {{ x: number, y: number }} gap
 * @returns {boolean} True when the block is nearer than the gap
 */
function inTheWay(rect, dy, block, gap) {
  return (
    rect.x - gap.x < block.x + block.width - TOUCH &&
    rect.x + rect.width + gap.x > block.x + TOUCH &&
    rect.y + dy - gap.y < block.y + block.height - TOUCH &&
    rect.y + dy + rect.height + gap.y > block.y + TOUCH
  );
}

/**
 * Move a caption one way until nothing is in its way.
 * @param {Rect} rect
 * @param {Rect[]} blocks
 * @param {{ x: number, y: number }} gap
 * @param {boolean} down - The way to go
 * @param {{ top: number, bottom: number }} limits - Where a caption may be
 * @returns {number|null} How far down (negative: up); null when it would leave the limits
 */
function slide(rect, blocks, gap, down, limits) {
  let dy = 0;
  // Every turn clears what was hit and can only meet blocks further on.
  for (let turn = 0; turn <= blocks.length; turn++) {
    const hit = blocks.filter((block) => inTheWay(rect, dy, block, gap));
    if (!hit.length) return dy;
    dy = down
      ? Math.max(...hit.map((block) => block.y + block.height + gap.y - rect.y))
      : Math.min(...hit.map((block) => block.y - gap.y - rect.height - rect.y));
    const top = rect.y + dy;
    if (top < limits.top - TOUCH || top + rect.height > limits.bottom + TOUCH) return null;
  }
  return null;
}

/**
 * How far a caption moves to be clear of what is in its way.
 * @param {Rect} rect - The caption in its normal place
 * @param {Rect[]} blocks - What may be in its way
 * @param {'top'|'middle'|'bottom'|string} anchor - Where the style puts captions
 * @param {{ x: number, y: number }} gap - How near a block may come
 * @param {{ top: number, bottom: number }} limits - Where a caption may be
 * @returns {number} Pixels down (negative: up): away from its edge for a
 *   caption at the top or the bottom — the other way when there is no room
 *   there — and the shorter way for one in the middle. 0 when nothing is in
 *   the way, and when there is no room either way: it then stays where it is
 */
export function clearOf(rect, blocks, anchor, gap, limits) {
  const up = slide(rect, blocks, gap, false, limits);
  if (up === 0) return 0;
  const down = slide(rect, blocks, gap, true, limits);
  if (anchor === 'middle' && up !== null && down !== null) return -up <= down ? up : down;
  return (anchor === 'top' ? (down ?? up) : (up ?? down)) ?? 0;
}

/**
 * The move of a caption group, for as long as it is on screen.
 * @param {ReturnType<typeof import('./geometry.js').placeWords>} placed - The
 *   group laid out in its normal place, in the lane it is drawn in
 * @param {Rect[]} blocks - What is in the frame while the group is on
 *   screen, in the pixels `placed` was laid out in
 * @param {import('./types.js').CaptionStyle} style - Resolved
 * @param {import('./types.js').CaptionFrame} frame - The frame of `placed`
 * @returns {number} Units to sit lower by (negative: higher), to the
 *   thousandth: the `lift` of `placeWords`
 */
export function liftFor(placed, blocks, style, frame) {
  if (!blocks.length) return 0;
  const { unit, step } = placed;
  const { anchor } = style.position;
  const rect = restRect(placed);
  // A second voice is tried with the first one's place as its own, so the
  // two move as the stack they are.
  rect.height += step;
  if (anchor !== 'bottom') rect.y -= step;
  const gap = { x: ROOM.beside * unit, y: ROOM.above * unit };
  const limits = { top: SAFE.y * unit, bottom: frame.height - SAFE.y * unit };
  const dy = clearOf(rect, blocks, anchor, gap, limits);
  return Math.round((dy / unit) * 1000) / 1000 || 0;
}
