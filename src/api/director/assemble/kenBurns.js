/**
 * Ken burns for stills — a gentle move chosen from the image's shape and
 * the adaptation's frame (docs/app-spec/EDL.md § kenBurns):
 * - image about the same shape as the frame → slow zoom in or out
 * - image wider than the frame (landscape in 9:16) → pan across it
 * - image taller than the frame (portrait in 16:9) → pan up or down it
 * @module api/director/assemble/kenBurns
 */

import { defaultKenBurns } from '#utils/edl/defaults.js';

/** Pan speed: fraction of the frame travelled per second. */
const PAN_RATE = 0.04;
/** Zoom gained per second, capped at MAX_ZOOM overall. */
const ZOOM_RATE = 0.025;
const MAX_ZOOM = 0.15;

/**
 * @param {{ width: number, height: number }} image - 0 when unknown
 * @param {{ width: number, height: number }} frame - Output resolution
 * @param {number} seconds - Clip length
 * @param {number} [index=0] - Alternates the direction from still to still
 * @returns {object} A complete `transform.kenBurns` block with `enabled: true`
 */
export function kenBurnsFor(image, frame, seconds, index = 0) {
  const kb = { ...defaultKenBurns(), enabled: true };
  const forward = index % 2 === 0;
  const frameAspect = frame.width / frame.height;
  const aspect = image.width && image.height ? image.width / image.height : frameAspect;
  const shape = aspect / frameAspect;
  const zoom = 1 + Math.min(MAX_ZOOM, ZOOM_RATE * seconds);
  const px = (/** @type {number} */ v) => Math.round(v);

  if (shape > 1.15) {
    // Cover fits the height; the extra width is room to pan sideways.
    const room = frame.height * aspect - frame.width;
    const travel = Math.min(room, frame.width * PAN_RATE * seconds);
    kb.startX = px(((forward ? 1 : -1) * travel) / 2);
    kb.endX = -kb.startX;
    kb.endScale = 1 + (zoom - 1) / 3;
  } else if (shape < 1 / 1.15) {
    // Cover fits the width; the extra height is room to pan vertically.
    const room = frame.width / aspect - frame.height;
    const travel = Math.min(room, frame.height * PAN_RATE * seconds);
    kb.startY = px(((forward ? 1 : -1) * travel) / 2);
    kb.endY = -kb.startY;
    kb.endScale = 1 + (zoom - 1) / 3;
  } else {
    kb.startScale = forward ? 1 : zoom;
    kb.endScale = forward ? zoom : 1;
  }
  kb.startScale = Math.round(kb.startScale * 1000) / 1000;
  kb.endScale = Math.round(kb.endScale * 1000) / 1000;
  return kb;
}
