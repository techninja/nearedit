/**
 * An element clip's picture in the interface: the rectangle around what it
 * shows — the brand model's own (`#utils/brand/element/bounds.js`, where the
 * compositor's caption pass reads it too) — and the part of the frame a
 * small picture of it is framed on. Pure and isomorphic.
 * @module utils/brandUi/elementBounds
 */

import { elementBounds } from '#utils/brand/element/bounds.js';

export { elementBounds };

/** @typedef {import('#utils/brand/element/bounds.js').Rect} Rect */
/** @typedef {import('#utils/brand/element/bounds.js').Size} Size */

/**
 * @param {Size} frame
 * @returns {Rect} The whole frame
 */
const whole = (frame) => ({ x: 0, y: 0, width: frame.width, height: frame.height });

/**
 * The part of the frame a small picture of an element shows: its bounds
 * with room around them, never closer than `closest` times — so a lower
 * third can be read on a tile and still sits visibly low in a frame. The
 * part has the frame's own shape, or the shape of the place the picture
 * goes (`aspect`): a wide tile then shows a band of a vertical frame.
 * @param {Rect} bounds - As `elementBounds` gives them
 * @param {Size} frame
 * @param {number} [closest=2.2] - The most the picture is enlarged
 * @param {number} [aspect] - Width over height of the part; default: the frame's
 * @returns {Rect} The whole frame for an element that fills most of it
 */
export function framing(bounds, frame, closest = 2.2, aspect = frame.width / frame.height) {
  const filled = (bounds.width * bounds.height) / (frame.width * frame.height);
  if (filled >= 0.8) return whole(frame);
  const room = 0.16 * Math.min(frame.width, frame.height);
  // The largest part of that shape the frame holds, then as much of it as the element needs.
  const most = { width: Math.min(frame.width, frame.height * aspect), height: 0 };
  most.height = most.width / aspect;
  const share = Math.max(
    (bounds.width + 2 * room) / most.width,
    (bounds.height + 2 * room) / most.height,
    1 / closest,
  );
  const same = Math.abs(aspect - frame.width / frame.height) < 1e-3;
  if (share >= 0.9 && same) return whole(frame);
  const width = most.width * Math.min(1, share);
  const height = most.height * Math.min(1, share);
  const x = bounds.x + bounds.width / 2 - width / 2;
  const y = bounds.y + bounds.height / 2 - height / 2;
  return {
    x: Math.max(0, Math.min(frame.width - width, x)),
    y: Math.max(0, Math.min(frame.height - height, y)),
    width,
    height,
  };
}
