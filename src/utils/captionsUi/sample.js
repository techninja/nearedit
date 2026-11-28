/**
 * The picture on a caption style's tile: a sentence being said, drawn by
 * the caption drawing itself (`drawCaptionAt`) over a backdrop that looks
 * like footage. A tile is a close view — about seventy units across, where
 * a wide frame is 178 — so the words are large enough to judge a style by;
 * everything else (font, outline, marking, motion, grouping) is exactly
 * what the preview and the render draw.
 * @module utils/captionsUi/sample
 */

import { captionFont, drawCaptionAt } from '#utils/captions/drawAt.js';

/** A sentence, timed as it would be spoken: `[start, end, text]`, seconds. */
export const SAMPLE_WORDS = Object.freeze([
  [0.2, 0.48, 'Say'],
  [0.5, 0.68, 'it'],
  [0.76, 0.98, 'and'],
  [1.0, 1.18, 'it'],
  [1.24, 1.62, 'shows'],
  [1.64, 1.86, 'up'],
  [1.96, 2.14, 'on'],
  [2.16, 2.7, 'screen.'],
]);

/** The sentence starts again after this many seconds: a short breath after the last word. */
export const SAMPLE_LOOP = 3.3;
/** The instant a tile shows while it does not move: mid-word, with a mark to see. */
export const SAMPLE_STILL = 1.42;
/** How many units a tile is wide. */
const VIEW_UNITS = 70;
/** Width over height of a tile. */
export const TILE_ASPECT = 2;

const SAMPLE_TEXT = SAMPLE_WORDS.map((word) => word[2]).join(' ');

/**
 * The frame a tile is drawn as: the tile itself, with units enlarged.
 * @param {number} width - Canvas pixels
 * @param {number} height
 * @param {any[]} [fonts] - The document's own fonts
 * @returns {import('#utils/captions/types.js').CaptionFrame}
 */
export function tileFrame(width, height, fonts) {
  const scale = width / VIEW_UNITS / (Math.min(width, height) / 100);
  return { width, height, outWidth: width, outHeight: height, scale, fonts };
}

/**
 * What must be loaded before a tile can be drawn in a style.
 * @param {unknown} style - A stored or resolved caption style, or a preset's name
 * @param {number} width - Canvas pixels
 * @param {number} height
 * @param {any[]} [fonts]
 * @returns {{ font: string, text: string }} A canvas `font` value and the characters asked of it
 */
export function tileFontNeed(style, width, height, fonts) {
  const text = `${SAMPLE_TEXT} ${SAMPLE_TEXT.toUpperCase()}`;
  return { font: captionFont(style, tileFrame(width, height, fonts)), text };
}

/**
 * Something to read captions against: dusk colours, a brighter patch where
 * a face would be, a darker floor.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function backdrop(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#27506b');
  sky.addColorStop(0.55, '#5b4a78');
  sky.addColorStop(1, '#a35a55');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(
    width * 0.3,
    height * 0.3,
    0,
    width * 0.3,
    height * 0.3,
    width * 0.45,
  );
  glow.addColorStop(0, 'rgb(255 236 200 / 55%)');
  glow.addColorStop(1, 'rgb(255 236 200 / 0%)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  const floor = ctx.createLinearGradient(0, height * 0.55, 0, height);
  floor.addColorStop(0, 'rgb(10 14 28 / 0%)');
  floor.addColorStop(1, 'rgb(10 14 28 / 45%)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw a tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {unknown} style - A stored or resolved caption style, or a preset's name
 * @param {number} time - Seconds; the sentence loops
 * @param {{ width: number, height: number }} size - Canvas pixels
 * @param {any[]} [fonts] - The document's own fonts
 * @returns {boolean} True when words were drawn (false between two loops)
 */
export function drawTile(ctx, style, time, size, fonts) {
  const { width, height } = size;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  backdrop(ctx, width, height);
  const at = ((time % SAMPLE_LOOP) + SAMPLE_LOOP) % SAMPLE_LOOP;
  const drawn = drawCaptionAt(ctx, SAMPLE_WORDS, at, style, tileFrame(width, height, fonts));
  ctx.restore();
  return drawn;
}
