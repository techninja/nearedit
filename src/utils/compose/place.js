/**
 * Placement — put a source into the frame with a clip's transform: crop,
 * fit, scale, offset, rotate about the anchor, fade. Geometry comes from
 * `geometry.js` (docs/app-spec/EDL.md § transform), the one implementation
 * every renderer shares. Three kinds of source are placed the same way:
 * a picture of any size, a frame-sized canvas a generator painted, and
 * vector drawing (a title) that is laid out in its own frame.
 * Isomorphic.
 * @module utils/compose/place
 */

import { placeSource } from '#utils/edl/geometry.js';

/**
 * @typedef {import('#utils/edl/geometry.js').FlatTransform} FlatTransform
 * @typedef {import('./frame.js').Frame} Frame
 */

/**
 * Draw in output pixels: the whole output frame scaled onto the canvas.
 * @param {any} ctx
 * @param {Frame} frame
 */
export function toOutputSpace(ctx, frame) {
  ctx.setTransform(frame.width / frame.outWidth, 0, 0, frame.height / frame.outHeight, 0, 0);
}

/**
 * Rotate the canvas about a point.
 * @param {any} ctx
 * @param {number} degrees - Clockwise
 * @param {number} x
 * @param {number} y
 */
function rotateAbout(ctx, degrees, x, y) {
  if (!degrees) return;
  ctx.translate(x, y);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-x, -y);
}

/**
 * @param {FlatTransform} t
 * @returns {boolean} True when a frame-sized source stays exactly where it is
 */
export function isIdentity(t) {
  const still =
    t.x === 0 && t.y === 0 && t.scaleX === 1 && t.scaleY === 1 && t.rotation % 360 === 0;
  return still && !t.cropTop && !t.cropBottom && !t.cropLeft && !t.cropRight;
}

/**
 * Draw a rectangle of an image where `placeSource` put a source: into the
 * destination rectangle, turned about the anchor, faded.
 * @param {any} ctx
 * @param {any} image - Anything `drawImage` takes
 * @param {{ sx: number, sy: number, sw: number, sh: number }} from - The
 *   part of the image to read, in its pixels
 * @param {{ dx: number, dy: number, dw: number, dh: number }} p - Where it
 *   goes, output pixels (`placeSource`)
 * @param {Frame} frame
 * @param {FlatTransform} t - Resolved transform
 * @param {number} alpha - 0..1
 */
export function drawPlaced(ctx, image, from, p, frame, t, alpha) {
  ctx.save();
  toOutputSpace(ctx, frame);
  ctx.globalAlpha = alpha;
  rotateAbout(ctx, t.rotation, p.dx + p.dw * t.anchorX, p.dy + p.dh * t.anchorY);
  ctx.drawImage(image, from.sx, from.sy, from.sw, from.sh, p.dx, p.dy, p.dw, p.dh);
  ctx.restore();
}

/**
 * Draw a footage frame or a still.
 * @param {any} ctx
 * @param {any} image - Anything `drawImage` takes
 * @param {{ width: number, height: number }} size - Natural size of the image
 * @param {Frame} frame
 * @param {FlatTransform} t - Resolved transform
 * @param {number} alpha - 0..1
 */
export function drawPicture(ctx, image, size, frame, t, alpha) {
  if (!(size.width > 0 && size.height > 0)) return;
  const p = placeSource(size.width, size.height, frame.outWidth, frame.outHeight, t);
  if (p.dw > 0 && p.dh > 0) drawPlaced(ctx, image, p, p, frame, t, alpha);
}

/**
 * Draw a frame-sized canvas (what a generator painted) as a source: it is
 * the output frame, so an identity transform copies it pixel for pixel.
 * @param {any} ctx
 * @param {any} canvas - `frame.width` × `frame.height`
 * @param {Frame} frame
 * @param {FlatTransform} t
 * @param {number} alpha - 0..1
 */
export function drawFrameSized(ctx, canvas, frame, t, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isIdentity(t)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
    return;
  }
  const p = placeSource(frame.outWidth, frame.outHeight, frame.outWidth, frame.outHeight, t);
  if (p.dw > 0 && p.dh > 0) {
    const kx = frame.width / frame.outWidth;
    const ky = frame.height / frame.outHeight;
    toOutputSpace(ctx, frame);
    rotateAbout(ctx, t.rotation, p.dx + p.dw * t.anchorX, p.dy + p.dh * t.anchorY);
    ctx.drawImage(canvas, p.sx * kx, p.sy * ky, p.sw * kx, p.sh * ky, p.dx, p.dy, p.dw, p.dh);
  }
  ctx.restore();
}

/**
 * Set a context up for vector drawing that is placed like a frame-sized
 * source: afterwards the origin is the centre of the source's own frame and
 * one unit is one output pixel of it. A crop becomes a clip. The caller
 * wraps this in `save` / `restore`.
 * @param {any} ctx
 * @param {Frame} frame
 * @param {FlatTransform} t
 * @returns {boolean} False when the transform leaves nothing to draw
 */
export function placeVector(ctx, frame, t) {
  const { outWidth: w, outHeight: h } = frame;
  const p = placeSource(w, h, w, h, t);
  if (!(p.dw > 0 && p.dh > 0)) return false;
  toOutputSpace(ctx, frame);
  rotateAbout(ctx, t.rotation, p.dx + p.dw * t.anchorX, p.dy + p.dh * t.anchorY);
  if (p.sw < w || p.sh < h) {
    ctx.beginPath();
    ctx.rect(p.dx, p.dy, p.dw, p.dh);
    ctx.clip();
  }
  ctx.translate(p.dx, p.dy);
  ctx.scale(p.dw / p.sw, p.dh / p.sh);
  ctx.translate(w / 2 - p.sx, h / 2 - p.sy);
  return true;
}
