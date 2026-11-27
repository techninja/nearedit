/**
 * The sprite source of a particle layer — a built-in shape or a loaded
 * image — as a chain of levels, each half the size of the one before, down
 * to a single pixel. A particle is drawn from the smallest level that is
 * comfortably larger than the particle on the canvas (see SHARPEN), so
 * sprites are not stretched up (they stay crisp) and never squeezed by much
 * more than two (they do not shimmer, and a small preview is as bright as
 * the full-size render). Shapes are drawn as vectors at each level; images,
 * and levels too small to draw into, are halved from the level above.
 * Isomorphic.
 * @module utils/compose/generators/particles/source
 */

import { pictureSize } from '#utils/compose/host.js';
import { SHAPES } from './shapes.js';
import { idOf } from './spriteCache.js';

/** Longer side of a shape's largest level, pixels. */
const SHAPE_TOP = 2048;
/** Shapes are drawn as vectors down to this size; smaller levels are averaged. */
const NATIVE = 16;
/** No level larger than this is used (an image may be larger). */
export const MAX_SIDE = 2048;
/**
 * A particle is drawn from the smallest level at least this much larger
 * than itself. Scaling a sprite down by between 1.22 and 2.44 with the
 * canvas's bilinear filter comes closest to how the canvas antialiases a
 * shape drawn directly at that size: less, and edges go soft; more, and
 * they turn jagged.
 */
export const SHARPEN = 1.22;

/**
 * @typedef {Object} Source
 * @property {string} key - Names the source, for caching
 * @property {number} w - Width as a share of the longer side
 * @property {number} h - Height as a share of the longer side
 * @property {boolean} round - Looks the same at every rotation
 * @property {boolean} flush - A shape whose outline lies along its box
 * @property {number} top - Longer side of level 0, pixels
 * @property {number} pw - Width of level 0, pixels
 * @property {number} ph - Height of level 0, pixels
 * @property {number} first - Largest level in use (see MAX_SIDE)
 * @property {number} last - Smallest level: one pixel
 * @property {any} [image] - Level 0 of an image source
 * @property {(ctx: any) => void} [paint] - Draws a shape source
 */

/**
 * A source at one level. `spanX` and `spanY` say what share of the canvas
 * the sprite's own box takes up: all of it, except for a shape whose
 * outline lies along its box (a square). Such a shape is drawn half a pixel
 * short of the canvas on every side, so that its straight edges are
 * antialiased like every other edge instead of ending on a pixel boundary.
 * @typedef {import('./spriteCache.js').Sprite & { spanX: number, spanY: number }} Picture
 */

/**
 * The first level whose longer side is at most a limit.
 * @param {number} top
 * @param {number} limit
 * @returns {number}
 */
export function levelWithin(top, limit) {
  let level = 0;
  while (top / 2 ** level > limit) level++;
  return level;
}

/**
 * @param {number} top - Longer side of level 0
 * @returns {{ first: number, last: number }} The levels in use
 */
const span = (top) => ({ first: levelWithin(top, MAX_SIDE), last: levelWithin(top, 1.999) });

/**
 * The source a parameter set asks for.
 * @param {Record<string, any>} p - Resolved parameters
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {Source|null} null when the image is not set, not loaded yet or empty
 */
export function sourceOf(p, env) {
  if (p.sprite !== 'image') {
    const shape = SHAPES[p.sprite] || SHAPES.dot;
    const [pw, ph] = [Math.ceil(SHAPE_TOP * shape.w), Math.ceil(SHAPE_TOP * shape.h)];
    const flush = shape.flush === true;
    return { key: p.sprite, ...shape, flush, top: SHAPE_TOP, pw, ph, ...span(SHAPE_TOP) };
  }
  const image = env.image(p.image);
  const { width, height } = pictureSize(image);
  if (!image || !(width > 0 && height > 0)) return null;
  const top = Math.max(width, height);
  const key = `i${idOf(image)}`;
  const [w, h] = [width / top, height / top];
  const flat = { round: false, flush: false };
  return { key, w, h, ...flat, image, top, pw: width, ph: height, ...span(top) };
}

/**
 * The level to draw a particle from.
 * @param {Source} source
 * @param {number} side - Longer side of the particle on the canvas, pixels
 * @param {number} [first] - Largest level allowed
 * @returns {number}
 */
export function levelFor(source, side, first = source.first) {
  let level = first;
  while (level < source.last && source.top / 2 ** (level + 1) >= side * SHARPEN) level++;
  return level;
}

/**
 * The picture of a source at a level.
 * @param {import('./spriteCache.js').SpriteCache} cache
 * @param {Source} source
 * @param {number} level
 * @returns {Picture}
 */
export function pictureOf(cache, source, level) {
  if (level === 0 && source.image) {
    return { canvas: source.image, width: source.pw, height: source.ph, spanX: 1, spanY: 1 };
  }
  return cache.get(`p|${source.key}|${level}`, () => {
    const width = Math.max(1, Math.ceil(source.pw / 2 ** level));
    const height = Math.max(1, Math.ceil(source.ph / 2 ** level));
    const canvas = cache.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (source.paint && (level === 0 || source.top / 2 ** level >= NATIVE)) {
      const inset = source.flush ? 1 : 0;
      ctx.translate(width / 2, height / 2);
      ctx.scale((width - inset) / source.w, (height - inset) / source.h);
      source.paint(ctx);
      return { canvas, width, height, spanX: 1 - inset / width, spanY: 1 - inset / height };
    }
    const above = pictureOf(cache, source, level - 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(above.canvas, 0, 0, above.width, above.height, 0, 0, width, height);
    return { canvas, width, height, spanX: above.spanX, spanY: above.spanY };
  });
}
