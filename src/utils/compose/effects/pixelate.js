/**
 * Pixelate — a mosaic of square blocks. The layer is shrunk so that one
 * pixel stands for one block, and enlarged again with smoothing off, which
 * gives every block one flat colour and a hard edge. Each block shows the
 * average of the picture around its middle (the layer is halved a few
 * times before the blocks are picked), not one stray pixel, so the mosaic
 * does not sparkle as the picture moves. The grid is centred on the frame:
 * animating `size` grows the blocks evenly in every direction.
 *
 * Where the layer is partly transparent the blocks are too: a block's alpha
 * is the average alpha around its middle.
 * @module utils/compose/effects/pixelate
 */

import { extendEdges } from '#utils/compose/filterPass.js';
import { MAX_LEVELS, reduce } from './lib/reduce.js';

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'pixelate',
  label: 'Pixelate',
  category: 'stylize',
  description: 'Mosaic of square blocks',
  params: {
    size: {
      type: 'number',
      default: 24,
      min: 1,
      max: 400,
      unit: 'px',
      label: 'Block size',
      animatable: true,
    },
  },
  apply(surface, params, _time, frame, env) {
    const block = params.size * frame.scale;
    if (!(block > 1)) return;
    const { width, height } = surface;
    // Average over the largest power of two that fits in a block.
    const levels = Math.min(MAX_LEVELS, Math.floor(Math.log2(block)));
    const { surface: averaged, factor } = reduce(surface, levels, env);
    // One pixel per block, the grid centred on the frame. A block that hangs
    // over the frame's edge takes its colour from the edge, so the picture's
    // edge pixels are repeated outward first.
    const columns = Math.ceil(width / 2 / block) * 2;
    const rows = Math.ceil(height / 2 / block) * 2;
    const left = width / 2 - (columns / 2) * block;
    const top = height / 2 - (rows / 2) * block;
    const pad = Math.ceil(block / factor) + 1;
    const padded = env.scratch(averaged.width + pad * 2, averaged.height + pad * 2);
    extendEdges(padded.ctx, averaged.canvas, averaged.width, averaged.height, pad);
    const grid = env.scratch(columns, rows);
    grid.ctx.imageSmoothingEnabled = false;
    grid.ctx.setTransform(factor / block, 0, 0, factor / block, -left / block, -top / block);
    grid.ctx.drawImage(padded.canvas, -pad, -pad);
    const { ctx } = surface;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(block, 0, 0, block, left, top);
    ctx.drawImage(grid.canvas, 0, 0);
  },
};
