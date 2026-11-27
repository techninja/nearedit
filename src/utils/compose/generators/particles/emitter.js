/**
 * The emitter — where on its shape a particle is born. Two random numbers
 * of the particle pick the spot; the result is relative to the emitter's
 * centre, before the emitter's rotation, in the unit the sizes are given in.
 * Isomorphic and pure.
 * @module utils/compose/generators/particles/emitter
 */

const TURN = Math.PI * 2;

/**
 * A spot on the outline of a box, a share `u` of the way round from the top
 * left corner, clockwise.
 * @param {number} w
 * @param {number} h
 * @param {number} u - 0..1
 * @param {{ x: number, y: number }} out
 */
function outline(w, h, u, out) {
  const at = u * 2 * (w + h);
  if (at < w) {
    out.x = at - w / 2;
    out.y = -h / 2;
  } else if (at < w + h) {
    out.x = w / 2;
    out.y = at - w - h / 2;
  } else if (at < 2 * w + h) {
    out.x = w / 2 - (at - w - h);
    out.y = h / 2;
  } else {
    out.x = -w / 2;
    out.y = h / 2 - (at - 2 * w - h);
  }
}

/**
 * Pick a birth place.
 * @param {string} shape - `point`, `line` (along the width), `box`,
 *   `circle` (the ellipse filling the box), `ring` (that ellipse's outline)
 *   or `edge` (the box's outline)
 * @param {number} w - Emitter width
 * @param {number} h - Emitter height
 * @param {number} u - 0..1
 * @param {number} v - 0..1
 * @param {{ x: number, y: number }} out - Receives the place
 */
export function place(shape, w, h, u, v, out) {
  out.x = 0;
  out.y = 0;
  if (shape === 'line') {
    out.x = (u - 0.5) * w;
  } else if (shape === 'box') {
    out.x = (u - 0.5) * w;
    out.y = (v - 0.5) * h;
  } else if (shape === 'circle' || shape === 'ring') {
    // The square root spreads births evenly over the area.
    const reach = shape === 'ring' ? 0.5 : Math.sqrt(u) / 2;
    out.x = Math.cos(v * TURN) * reach * w;
    out.y = Math.sin(v * TURN) * reach * h;
  } else if (shape === 'edge') {
    outline(w, h, u, out);
  }
}
