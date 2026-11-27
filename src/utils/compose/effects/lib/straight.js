/**
 * Straight colours — how an effect changes a layer's colours with composite
 * operations without disturbing its transparency.
 *
 * A canvas stores colours multiplied by alpha, and every blend mode mixes
 * the layer with whatever is drawn over it wherever the layer is not opaque:
 * multiplying a soft-edged layer by a colour would leave a fringe of that
 * colour around it. So the layer is first turned into an opaque picture of
 * its un-multiplied ("straight") colours — its pixels over black, divided by
 * its alpha with a colour-dodge — the effect blends on that with no alpha in
 * play, and `putStraight` paints the result back through the layer's own
 * alpha. For an opaque layer the copy is exact; elsewhere it is within a
 * level. Seven cheap whole-frame operations, no pixel loop.
 * Isomorphic.
 * @module utils/compose/effects/lib/straight
 */

/**
 * @typedef {import('#utils/compose/pool.js').Surface} Surface
 * @typedef {import('#utils/compose/host.js').ComposeEnv} ComposeEnv
 */

/**
 * An opaque copy of a surface holding its straight colours (black where the
 * surface is fully transparent).
 * @param {{ canvas: any, width: number, height: number }} source
 * @param {ComposeEnv} env
 * @returns {Surface} A scratch surface of the same size
 */
export function straightCopy(source, env) {
  const { width, height } = source;
  // 1 − alpha as an opaque grey: white, minus the layer's coverage, over black.
  const inverse = env.scratch(width, height);
  inverse.ctx.fillStyle = '#ffffff';
  inverse.ctx.fillRect(0, 0, width, height);
  inverse.ctx.globalCompositeOperation = 'destination-out';
  inverse.ctx.drawImage(source.canvas, 0, 0);
  inverse.ctx.globalCompositeOperation = 'destination-over';
  inverse.ctx.fillStyle = '#000000';
  inverse.ctx.fillRect(0, 0, width, height);
  // The layer over black holds colour × alpha; dodge divides by 1 − (1 − alpha).
  const out = env.scratch(width, height);
  out.ctx.fillStyle = '#000000';
  out.ctx.fillRect(0, 0, width, height);
  out.ctx.drawImage(source.canvas, 0, 0);
  out.ctx.globalCompositeOperation = 'color-dodge';
  out.ctx.drawImage(inverse.canvas, 0, 0);
  out.ctx.globalCompositeOperation = 'source-over';
  return out;
}

/**
 * Replace a surface's colours with those of an opaque picture, keeping its
 * alpha exactly.
 * @param {Surface} surface - The layer, still as it was
 * @param {Surface} straight - Opaque, same size
 * @param {number} [amount=1] - 0..1, how far towards the new colours
 * @param {number} [x=0] - Where the picture's corner goes
 * @param {number} [y=0]
 */
export function putStraight(surface, straight, amount = 1, x = 0, y = 0) {
  const { ctx } = surface;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = Math.max(0, Math.min(1, amount));
  ctx.drawImage(straight.canvas, x, y);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Fill a whole opaque surface with a colour through a composite operation —
 * one step of colour arithmetic on straight colours (`multiply` scales,
 * `color-dodge` divides by one minus the colour, `lighter` adds,
 * `difference` with white inverts).
 * @param {Surface} surface
 * @param {string} operation - A `globalCompositeOperation`
 * @param {string} color - CSS colour
 */
export function blendFill(surface, operation, color) {
  const { ctx } = surface;
  ctx.globalCompositeOperation = operation;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, surface.width, surface.height);
  ctx.globalCompositeOperation = 'source-over';
}
