/**
 * Geometry filters of one layer: crop → scale (with colour conversion to
 * BT.709) → rotate, either fixed or animated between the placement at the
 * clip's start and at its end. Pure.
 * @module api/render/layerFilters
 */

import { filter, lerpExpr, num, quote } from './expr.js';
import { pixelRect, rotatedBox, visiblePart } from './placement.js';

/** @typedef {import('./placement.js').Rect} Rect */
/** @typedef {import('./placement.js').LayerGeometry} LayerGeometry */

/**
 * @typedef {Object} LayerSource
 * @property {number} width - Displayed size of the frames entering the chain
 * @property {number} height
 * @property {boolean} [anamorphic] - Frames arrive with non-square pixels
 * @property {string} [matrix] - Source YUV matrix, '' for RGB
 * @typedef {Object} GeometryContext
 * @property {{ width: number, height: number }} out - Rendered frame size
 * @property {{ chroma: string, scaleFlags: string }} preset
 * @property {{ local: string, frame: string, output: string }} progress - The clip's
 *   0..1 progress as an expression of the layer's own `t`, of the frame
 *   counter `on`, and of the output timeline's `t`
 * @typedef {Object} GeometryResult
 * @property {string[]} filters
 * @property {number|string} x - Overlay position: pixels or a quoted expression
 * @property {number|string} y
 * @property {boolean} animated - Filters and position depend on time
 * @property {string[]} warnings
 */

const MAX_SIDE = 16384;
const side = (v) => Math.max(1, Math.min(MAX_SIDE, Math.round(v)));
const onFrame = (r, out) => r.x < out.width && r.y < out.height && r.x + r.w > 0 && r.y + r.h > 0;

/**
 * Scale + pixel-format filters for a target size, converting colour on the way.
 * @param {LayerSource} source
 * @param {{ chroma: string, scaleFlags: string }} preset
 * @returns {(w: number, h: number) => string[]}
 */
function scaler(source, preset) {
  const colour = { out_color_matrix: 'bt709', out_range: 'tv', flags: preset.scaleFlags };
  return (w, h) => [
    filter('scale', { w, h, in_color_matrix: source.matrix || undefined, ...colour }),
    `format=yuva${preset.chroma}p`,
  ];
}

/** @param {Rect} crop @param {LayerSource} source @returns {string[]} */
function cropFilter(crop, source) {
  const x = Math.min(source.width - 1, Math.max(0, Math.round(crop.x)));
  const y = Math.min(source.height - 1, Math.max(0, Math.round(crop.y)));
  const w = Math.max(1, Math.min(source.width - x, Math.round(crop.x + crop.w) - x));
  const h = Math.max(1, Math.min(source.height - y, Math.round(crop.y + crop.h) - y));
  if (w === source.width && h === source.height) return [];
  return [filter('crop', { w, h, x, y, exact: 1 })];
}

/** @param {LayerGeometry} g @param {number} w @param {number} h @returns {string[]} */
function turnFilters(g, w, h) {
  const flips = [...(g.flipX ? ['hflip'] : []), ...(g.flipY ? ['vflip'] : [])];
  if (!g.rotation) return flips;
  const box = rotatedBox({ x: 0, y: 0, w, h }, g.rotation, 0.5, 0.5);
  const angle = num((g.rotation * Math.PI) / 180, 8);
  return [...flips, filter('rotate', { a: angle, ow: side(box.w), oh: side(box.h), c: 'none' })];
}

/**
 * A layer that looks the same on every frame.
 * @param {LayerGeometry} g
 * @param {LayerSource} source
 * @param {GeometryContext} ctx
 * @returns {GeometryResult|null} null when the layer is entirely off-frame
 */
function fixedGeometry(g, source, ctx) {
  const scale = scaler(source, ctx.preset);
  const done = { animated: false, warnings: [] };
  if (!g.rotation) {
    const part = visiblePart(g.crop[0], g.rect[0], source, ctx.out);
    if (!part) return null;
    const sized = [...cropFilter(part.crop, source), ...scale(part.rect.w, part.rect.h)];
    return { filters: [...sized, ...turnFilters(g, 0, 0)], x: part.rect.x, y: part.rect.y, ...done };
  }
  const w = side(g.rect[0].w);
  const h = side(g.rect[0].h);
  const box = pixelRect(rotatedBox({ ...g.rect[0], w, h }, g.rotation, g.anchorX, g.anchorY));
  if (!onFrame(box, ctx.out)) return null;
  const filters = [...cropFilter(g.crop[0], source), ...scale(w, h), ...turnFilters(g, w, h)];
  return { filters, x: box.x, y: box.y, ...done };
}

/**
 * A ken-burns layer: brought to its largest size once, then resized per frame.
 * @param {LayerGeometry} g
 * @param {LayerSource} source
 * @param {GeometryContext} ctx
 * @returns {GeometryResult}
 */
function movingGeometry(g, source, ctx) {
  const scale = scaler(source, ctx.preset);
  const warnings = [];
  const w = side(Math.max(g.rect[0].w, g.rect[1].w));
  const h = side(Math.max(g.rect[0].h, g.rect[1].h));
  let filters;
  if (g.cropMoves && !g.rotation) {
    // The crop window itself moves: warp it onto the full source frame.
    const [a, b] = g.crop;
    const edge = (from, to) => quote(lerpExpr(from, to, ctx.progress.frame));
    const left = edge(a.x, b.x);
    const right = edge(a.x + a.w, b.x + b.w);
    const top = edge(a.y, b.y);
    const bottom = edge(a.y + a.h, b.y + b.h);
    const corners = { x0: left, y0: top, x1: right, y1: top, x2: left, y2: bottom, x3: right, y3: bottom };
    const warp = filter('perspective', { ...corners, sense: 'source', eval: 'frame' });
    filters = [...scale(source.width, source.height), warp, filter('scale', { w, h })];
  } else {
    if (g.cropMoves) warnings.push('an animated crop is not applied to a rotated clip');
    filters = [...cropFilter(g.crop[0], source), ...scale(w, h)];
  }
  filters.push(...turnFilters(g, w, h));
  const boxes = g.rect.map((r) => (g.rotation ? rotatedBox(r, g.rotation, g.anchorX, g.anchorY) : r));
  const span = (k, p) => lerpExpr(boxes[0][k], boxes[1][k], p);
  const size = (k) => quote(`max(1,round(${span(k, ctx.progress.local)}))`);
  const resize = { w: size('w'), h: size('h'), eval: 'frame', flags: ctx.preset.scaleFlags };
  filters.push(filter('scale', resize));
  const at = (k) => quote(`round(${span(k, ctx.progress.output)})`);
  return { filters, x: at('x'), y: at('y'), animated: true, warnings };
}

/**
 * Geometry filters and overlay position of a layer.
 * @param {LayerGeometry} g
 * @param {LayerSource} source
 * @param {GeometryContext} ctx
 * @returns {GeometryResult|null} null when the layer cannot be seen
 */
export function geometryFilters(g, source, ctx) {
  if (g.opacity <= 0) return null;
  const square = source.anamorphic
    ? [filter('scale', { w: source.width, h: source.height }), 'setsar=1']
    : [];
  const moving = g.moves || g.cropMoves;
  const result = moving ? movingGeometry(g, source, ctx) : fixedGeometry(g, source, ctx);
  if (!result) return null;
  const veil = g.opacity < 1 ? [filter('lut', { a: quote(`val*${num(g.opacity, 4)}`) })] : [];
  return { ...result, filters: [...square, ...result.filters, ...veil] };
}
