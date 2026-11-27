/**
 * Sprite sheets — one canvas holding a source at one level, once per colour
 * step, each copy tinted. Every particle of a layer that is drawn at that
 * level is then a `drawImage` out of the same canvas, whatever its colour.
 *
 * Each cell is the picture inside a transparent margin one pixel wide, and
 * a particle is drawn from the whole cell. The outline of a sprite is thus
 * always made by the filter that scales the sheet (a canvas does not
 * antialias the border of an upright `drawImage`, it snaps it to whole
 * pixels), and the pixels a filter reaches for beyond a cell are the
 * margin of the next one — transparent, whatever a canvas does there.
 * Isomorphic.
 * @module utils/compose/generators/particles/atlas
 */

import { pictureOf } from './source.js';

/** A sheet is never wider than this; its cells wrap into rows. */
const MAX_WIDTH = 4096;
/**
 * Longest side of the level a sheet with several tints is made from: one
 * for a colour change over life (32 cells), one for a pick among up to five
 * colours. This bounds a sheet to about 9 million pixels. A larger particle
 * is drawn from that level scaled up.
 */
export const TINTED_SIDE = { life: 512, picked: 1024 };

/**
 * @typedef {Object} Atlas
 * @property {any} canvas
 * @property {number} width - Of the canvas
 * @property {number} height
 * @property {number} cw - Width of a cell, margin included, pixels
 * @property {number} ch - Height of a cell
 * @property {number} cols - Cells per row
 * @property {number} cells
 * @property {number} padX - Cell width over the width of the sprite's own box
 * @property {number} padY
 */

/**
 * The sheet of a source at a level: one cell per colour step when it is
 * tinted, a single cell otherwise. Cell `i` starts at
 * `((i % cols) × cw, floor(i / cols) × ch)`.
 * @param {import('./spriteCache.js').SpriteCache} cache
 * @param {import('./source.js').Source} source
 * @param {number} level
 * @param {import('./ramp.js').Ramp} ramp
 * @param {number} tint - 0..1: how much of the step's colour replaces the
 *   picture's own (1 for shapes, which are drawn white)
 * @returns {Atlas}
 */
export function atlasOf(cache, source, level, ramp, tint) {
  const tinted = tint > 0;
  const key = `a|${source.key}|${level}|${tinted ? `${tint}|${ramp.key}` : ''}`;
  return cache.get(key, () => {
    const picture = pictureOf(cache, source, level);
    const { width: w, height: h } = picture;
    const [cw, ch] = [w + 2, h + 2];
    const cells = tinted ? ramp.fills.length : 1;
    const cols = Math.min(cells, Math.max(1, Math.floor(MAX_WIDTH / cw)));
    const width = cols * cw;
    const height = Math.ceil(cells / cols) * ch;
    const canvas = cache.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    for (let cell = 0; cell < cells; cell++) {
      const x = 1 + (cell % cols) * cw;
      const y = 1 + Math.floor(cell / cols) * ch;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(picture.canvas, 0, 0, w, h, x, y, w, h);
      if (!tinted) continue;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = tint;
      ctx.fillStyle = ramp.fills[cell];
      ctx.fillRect(x, y, w, h);
    }
    const padX = cw / (w * picture.spanX);
    const padY = ch / (h * picture.spanY);
    return { canvas, width, height, cw, ch, cols, cells, padX, padY };
  });
}
