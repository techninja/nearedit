/**
 * Ken-burns geometry: the layer is brought to its largest size once, then
 * resized and moved per frame through the placements the shared maths
 * gives along the clip — a straight line for pan and zoom, a piecewise
 * path when the crop moves too. Pure.
 * @module api/render/layerMotion
 */

import { curveExpr, filter, lerpExpr, quote } from './expr.js';
import { cropFilter, scaler, side, turnFilters } from './layerParts.js';
import { rotatedBox } from './placement.js';

/** @typedef {import('./layerParts.js').GeometryResult} GeometryResult */

/**
 * Warp a moving crop window onto the full source frame, frame by frame.
 * @param {import('./placement.js').Rect[]} crop - Window along the clip (it moves linearly)
 * @param {string} progress - 0..1 expression of the frame counter
 * @returns {string}
 */
function cropWarp(crop, progress) {
  const [a, b] = [crop[0], crop[crop.length - 1]];
  const edge = (from, to) => quote(lerpExpr(from, to, progress));
  const left = edge(a.x, b.x);
  const right = edge(a.x + a.w, b.x + b.w);
  const top = edge(a.y, b.y);
  const bottom = edge(a.y + a.h, b.y + b.h);
  const corners = { x0: left, y0: top, x1: right, y1: top };
  const lower = { x2: left, y2: bottom, x3: right, y3: bottom };
  return filter('perspective', { ...corners, ...lower, sense: 'source', eval: 'frame' });
}

/**
 * @param {import('./placement.js').LayerGeometry} g
 * @param {import('./layerParts.js').LayerSource} source
 * @param {import('./layerParts.js').GeometryContext} ctx
 * @returns {GeometryResult}
 */
export function movingGeometry(g, source, ctx) {
  const scale = scaler(source, ctx.preset);
  const w = side(Math.max(...g.rect.map((r) => r.w)));
  const h = side(Math.max(...g.rect.map((r) => r.h)));
  const turn = turnFilters(g, w, h);
  let once;
  let each = [];
  if (g.cropMoves) {
    once = scale(source.width, source.height);
    const resize = filter('scale', { w, h, flags: ctx.preset.scaleFlags });
    each = [cropWarp(g.crop, ctx.progress.frame), resize, ...turn];
  } else {
    once = [...cropFilter(g.crop[0], source), ...scale(w, h), ...turn];
  }
  const boxes = g.rect.map((r) =>
    g.rotation ? rotatedBox(r, g.rotation, g.anchorX, g.anchorY) : r,
  );
  const span = (k, p) =>
    curveExpr(
      boxes.map((box) => box[k]),
      p,
    );
  const resizes = ['w', 'h'].some((k) =>
    boxes.some((box) => Math.abs(box[k] - boxes[0][k]) > 1e-6),
  );
  if (resizes) {
    const size = (k) => quote(`max(1,round(${span(k, ctx.progress.local)}))`);
    const options = { w: size('w'), h: size('h'), eval: 'frame', flags: ctx.preset.scaleFlags };
    each.push(filter('scale', options));
  }
  const at = (k) => quote(`round(${span(k, ctx.progress.output)})`);
  return { once, each, x: at('x'), y: at('y'), animated: true, warnings: [] };
}
