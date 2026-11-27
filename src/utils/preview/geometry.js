/**
 * Where a clip sits in the frame — the geometry the preview overlay draws
 * its box and handles from. It is the compositor's own placement
 * (`resolveClip` → `resolveTransform` → `placeSource`, rotation about the
 * anchor): footage and stills are placed by their natural size, titles and
 * generators are frame-sized sources. Everything is in output pixels.
 * Pure and isomorphic.
 * @module utils/preview/geometry
 */

import { resolveClip } from '#utils/edl/animate.js';
import { parseResolution } from '#utils/edl/factory.js';
import { clipProgress, placeSource, resolveTransform } from '#utils/edl/geometry.js';

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ width: number, height: number }} Size */
/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

/**
 * A rectangle in the output frame, rotated about a pivot.
 * @typedef {Object} Box
 * @property {number} x - Left edge before rotation
 * @property {number} y - Top edge before rotation
 * @property {number} width
 * @property {number} height
 * @property {number} rotation - Degrees clockwise
 * @property {Point} pivot - What the rotation turns about
 * @property {import('#utils/edl/geometry.js').FlatTransform} transform - The
 *   transform in force at that moment (keyframes and ken burns applied)
 */

/**
 * The box of a clip at a moment.
 * @param {{ resolution?: string }} edl
 * @param {any} clip - As stored
 * @param {number} time - Timeline seconds
 * @param {Size|null} [size] - Natural size of the footage or still; null for
 *   a frame-sized source (title, generator)
 * @param {Rect|null} [content] - The part of a frame-sized source to box
 *   (a title's text block), in that source's own pixels; default: all of it
 * @returns {Box}
 */
export function clipBox(edl, clip, time, size = null, content = null) {
  const out = parseResolution(edl.resolution);
  const shown = resolveClip(clip, time);
  const transform = resolveTransform(shown, clipProgress(shown, time));
  const source = size && size.width > 0 && size.height > 0 ? size : out;
  const p = placeSource(source.width, source.height, out.width, out.height, transform);
  const pivot = { x: p.dx + p.dw * transform.anchorX, y: p.dy + p.dh * transform.anchorY };
  const { rotation } = transform;
  if (!content || size) {
    return { x: p.dx, y: p.dy, width: p.dw, height: p.dh, rotation, pivot, transform };
  }
  const kx = p.dw / p.sw;
  const ky = p.dh / p.sh;
  return {
    x: p.dx + (content.x - p.sx) * kx,
    y: p.dy + (content.y - p.sy) * ky,
    width: content.width * kx,
    height: content.height * ky,
    rotation,
    pivot,
    transform,
  };
}

/**
 * Turn a point about a centre.
 * @param {Point} point
 * @param {Point} about
 * @param {number} degrees - Clockwise (the y axis points down)
 * @returns {Point}
 */
export function rotatePoint(point, about, degrees) {
  const angle = (degrees * Math.PI) / 180;
  const dx = point.x - about.x;
  const dy = point.y - about.y;
  return {
    x: about.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: about.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

/**
 * @param {Box} box
 * @returns {Point} Centre of the box as it appears (after rotation)
 */
export function boxCenter(box) {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return rotatePoint(centre, box.pivot, box.rotation);
}

/**
 * @param {Box} box
 * @returns {Point[]} The four corners as they appear: top-left, top-right,
 *   bottom-right, bottom-left
 */
export function boxCorners(box) {
  const { x, y, width, height } = box;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((corner) => rotatePoint(corner, box.pivot, box.rotation));
}
