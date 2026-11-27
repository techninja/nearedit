/**
 * Geometry filters of one layer: crop → scale (with colour conversion to
 * BT.709) → rotate → opacity, and where the result goes on the frame. Pure.
 * @module api/render/layerFilters
 */

import { filter, num, quote } from './expr.js';
import { movingGeometry } from './layerMotion.js';
import { cropFilter, scaler, side, turnFilters } from './layerParts.js';
import { rotatedBox } from './placement.js';
import { pixelRect, visiblePart } from './visible.js';

/** @typedef {import('./layerParts.js').GeometryResult} GeometryResult */

const onFrame = (r, out) => r.x < out.width && r.y < out.height && r.x + r.w > 0 && r.y + r.h > 0;

/**
 * A layer that looks the same on every frame.
 * @param {import('./placement.js').LayerGeometry} g
 * @param {import('./layerParts.js').LayerSource} source
 * @param {import('./layerParts.js').GeometryContext} ctx
 * @returns {GeometryResult|null} null when the layer is entirely off-frame
 */
function fixedGeometry(g, source, ctx) {
  const scale = scaler(source, ctx.preset);
  const fixed = { each: [], animated: false, warnings: [] };
  if (!g.rotation) {
    // Only the part the frame shows is cropped out and scaled.
    const part = visiblePart(g.crop[0], g.rect[0], source, ctx.out);
    if (!part) return null;
    const sized = [...cropFilter(part.crop, source), ...scale(part.rect.w, part.rect.h)];
    const once = [...sized, ...turnFilters(g, part.rect.w, part.rect.h)];
    return { once, x: part.rect.x, y: part.rect.y, ...fixed };
  }
  const w = side(g.rect[0].w);
  const h = side(g.rect[0].h);
  const box = pixelRect(rotatedBox({ ...g.rect[0], w, h }, g.rotation, g.anchorX, g.anchorY));
  if (!onFrame(box, ctx.out)) return null;
  const once = [...cropFilter(g.crop[0], source), ...scale(w, h), ...turnFilters(g, w, h)];
  return { once, x: box.x, y: box.y, ...fixed };
}

/**
 * Geometry filters and overlay position of a layer.
 * @param {import('./placement.js').LayerGeometry} g
 * @param {import('./layerParts.js').LayerSource} source
 * @param {import('./layerParts.js').GeometryContext} ctx
 * @returns {GeometryResult|null} null when the layer cannot be seen
 */
export function geometryFilters(g, source, ctx) {
  if (g.opacity <= 0) return null;
  const moving = g.moves || g.cropMoves;
  const result = moving ? movingGeometry(g, source, ctx) : fixedGeometry(g, source, ctx);
  if (!result) return null;
  // Non-square pixels are squared first, so every later size is in display pixels.
  const square = source.anamorphic
    ? [filter('scale', { w: source.width, h: source.height }), 'setsar=1']
    : [];
  const veil = g.opacity < 1 ? [filter('lut', { a: quote(`val*${num(g.opacity, 4)}`) })] : [];
  const warnings = g.cropHeld ? ['an animated crop is not applied to a rotated clip'] : [];
  return { ...result, once: [...square, ...result.once, ...veil], warnings };
}
