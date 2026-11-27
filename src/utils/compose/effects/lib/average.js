/**
 * Averaging two pictures without drift. An 8-bit canvas rounds whenever it
 * scales a picture's values, and most ways of taking "half of each" round
 * the same way every time: a few such steps in a row and the picture has
 * visibly brightened or darkened. Measured on both canvases, a picture
 * drawn at 127/255 onto an empty surface comes out rounded down
 * (⌊v / 2⌋), and one added on top at 128/255 rounded up (⌈v / 2⌉): the two
 * halves of an average then sum to the whole. Equal pictures average to
 * exactly themselves, alpha included, and uneven ones carry no bias.
 * Isomorphic.
 * @module utils/compose/effects/lib/average
 */

/**
 * Draw the average of two pictures onto a blank context.
 * @param {any} ctx - Context of an empty surface, left in `lighter` mode
 * @param {(ctx: any) => void} drawFirst - Draws the first picture (it may
 *   set a transform; it must not change alpha or the composite operation)
 * @param {(ctx: any) => void} drawSecond - Draws the second picture
 */
export function averageInto(ctx, drawFirst, drawSecond) {
  ctx.globalAlpha = 127 / 255;
  drawFirst(ctx);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 128 / 255;
  drawSecond(ctx);
}
