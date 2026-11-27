/**
 * Grain — film grain: fine noise that changes on every frame. The noise is
 * blended in `overlay` mode, which is strongest in the midtones, leaves
 * pure black and white alone, and brightens exactly as often as it darkens
 * — so the picture's overall level does not move.
 *
 * The noise is a small tile of random cells (deterministic: a function of
 * `variant` and the frame number), enlarged to `size` output pixels per
 * cell and repeated across the frame. The cells are the same at any canvas
 * size, so a preview shows the grain the render will have. The blend runs
 * on the layer's straight colours (`lib/straight.js`): alpha is untouched.
 * @module utils/compose/effects/grain
 */

import { hash } from '#utils/compose/random.js';
import { halve } from './lib/reduce.js';
import { putStraight, straightCopy } from './lib/straight.js';

/** The noise tile is this many cells on a side. */
export const TILE_CELLS = 128;

/**
 * The grey that `overlay` leaves a picture unchanged at is 127.5; the tile
 * is centred half a level higher because a canvas rounds down when it
 * enlarges the cells, by about that much.
 */
const CENTRE = 128;

/** Pixels per cell the noise is drawn with before it is averaged down. */
const OVERSAMPLE = 4;

/**
 * Fill an RGBA array with grain: mid grey plus or minus noise. Each value
 * is the sum of two uniform ones (a triangular spread, gentler than flat
 * noise), centred on CENTRE.
 * @param {Uint8ClampedArray} data - `cells × cells × 4` bytes
 * @param {number} cells
 * @param {number} amount - 0..1; 1 swings a full ±127.5
 * @param {number} seed
 * @param {boolean} colored - Separate noise per channel
 */
export function grainPixels(data, cells, amount, seed, colored) {
  const swing = (amount * 127.5) / 65535;
  for (let y = 0, i = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++, i += 4) {
      for (let c = 0; c < 3; c++) {
        if (c > 0 && !colored) {
          data[i + c] = data[i];
          continue;
        }
        const h = hash(seed, x, y, c);
        data[i + c] = CENTRE + ((h & 0xffff) + (h >>> 16) - 65535) * swing;
      }
      data[i + 3] = 255;
    }
  }
}

/**
 * The noise tile at the size it is drawn. Between cells the noise blends
 * smoothly, and a pixel shows the average of what it covers — so the tile
 * is first drawn with at least OVERSAMPLE pixels per cell and then halved
 * down to size, exactly (`halve`). A preview whose pixels each hold several cells and a render
 * whose cells each span several pixels come out as the same picture. The
 * cells are drawn with their neighbours across the tile's seam around them,
 * so the tile repeats without one.
 * @param {Record<string, any>} params
 * @param {number} cell - Canvas pixels per cell
 * @param {number} seed
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {import('#utils/compose/pool.js').Surface}
 */
function grainTile(params, cell, seed, env) {
  const cells = env.scratch(TILE_CELLS + 2, TILE_CELLS + 2);
  const image = cells.ctx.createImageData(TILE_CELLS, TILE_CELLS);
  grainPixels(image.data, TILE_CELLS, params.amount, seed, params.colored);
  for (const dx of [-TILE_CELLS, 0, TILE_CELLS]) {
    for (const dy of [-TILE_CELLS, 0, TILE_CELLS]) cells.ctx.putImageData(image, 1 + dx, 1 + dy);
  }
  const size = Math.max(8, Math.round(TILE_CELLS * cell));
  const halvings = Math.max(0, Math.ceil(Math.log2((OVERSAMPLE * TILE_CELLS) / size)));
  const fine = size * 2 ** halvings;
  let tile = env.scratch(fine, fine);
  const step = fine / TILE_CELLS;
  tile.ctx.drawImage(cells.canvas, -step, -step, cells.width * step, cells.height * step);
  for (let i = 0; i < halvings; i++) tile = halve(tile, env);
  return tile;
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'grain',
  label: 'Grain',
  category: 'stylize',
  description: 'Film grain: animated noise in the midtones',
  params: {
    amount: {
      type: 'number',
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      animatable: true,
    },
    size: {
      type: 'number',
      default: 1.5,
      min: 0.5,
      max: 32,
      step: 0.1,
      unit: 'px',
      label: 'Grain size',
      animatable: true,
    },
    colored: { type: 'boolean', default: false, label: 'Coloured' },
    animated: { type: 'boolean', default: true, label: 'Changes every frame' },
    variant: { type: 'number', default: 1, min: 0, max: 9999, step: 1, label: 'Variant' },
  },
  apply(surface, params, time, frame, env) {
    if (!(params.amount > 0)) return;
    const seed = hash(params.variant, params.animated ? time.frame : 0, 7919);
    const tile = grainTile(params, params.size * frame.scale, seed, env);
    const picture = straightCopy(surface, env);
    const { ctx } = picture;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(tile.canvas, 'repeat');
    ctx.fillRect(0, 0, picture.width, picture.height);
    putStraight(surface, picture);
  },
};
