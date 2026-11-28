/**
 * Outline — a sticker's border: the layer's shape grown outward by `width`
 * and filled with one colour, laid under the layer. It follows whatever is
 * opaque — a cut-out person, the letters of a title, a logo — and rounds
 * every corner.
 *
 * A canvas cannot grow a shape, but a blurred shape knows how far every
 * pixel is from its edge: the layer's alpha is blurred, and a table reads
 * the blurred alpha as that distance and draws a new, hard edge `width`
 * further out (`matteEdge.js`, which the cutout's matte uses to move its
 * edge too). One blur and one pass over the pixels, on a copy reduced so
 * that the blur stays a few pixels wide — a wide border has no fine detail.
 * What the method costs in exchange: a line much thinner than the border
 * gets a thinner border, and a faint haze gets none.
 *
 * `width` is in units — hundredths of the frame's shorter side — so one
 * setting suits a wide, a tall and a square frame alike. `softness` is how
 * much of the width the border's own edge fades over.
 * @module utils/compose/effects/outline
 */

import { parseColor } from '#utils/compose/color.js';
import { drawFiltered } from '#utils/compose/filterPass.js';
import { alphaToShape } from '#utils/compose/matteCurve.js';
import { FOOTPRINT, HARDEST, RAMP, edgeShape } from '#utils/compose/matteEdge.js';

/** The border is made at the largest size at which it is under this wide, pixels. */
const WORK_WIDTH = 6;
const MAX_LEVELS = 3;

/**
 * A copy of a surface halved `levels` times.
 * @param {import('#utils/compose/pool.js').Surface} surface
 * @param {number} levels
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {import('#utils/compose/pool.js').Surface} A scratch surface whose pixels may be read
 */
function reduced(surface, levels, env) {
  let small = surface;
  for (let i = 0; i < Math.max(1, levels); i++) {
    const by = levels ? 2 : 1;
    const next = env.scratch(Math.ceil(small.width / by), Math.ceil(small.height / by), true);
    next.ctx.drawImage(small.canvas, 0, 0, small.width / by, small.height / by);
    small = next;
  }
  return small;
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'outline',
  label: 'Outline',
  category: 'stylize',
  description: "A sticker's border around the layer's shape",
  params: {
    color: { type: 'color', default: '#ffffff', label: 'Colour', animatable: true },
    width: {
      ...{ type: 'number', default: 0.8, min: 0, max: 10, step: 0.1, unit: 'u' },
      ...{ label: 'Width', animatable: true },
    },
    softness: {
      ...{ type: 'number', default: 0, min: 0, max: 1, step: 0.01 },
      ...{ label: 'Softness', animatable: true },
    },
  },
  apply(surface, params, _time, frame, env) {
    const [r, g, b, a] = parseColor(params.color, [255, 255, 255, 1]);
    const wide = (params.width * Math.min(frame.width, frame.height)) / 100;
    if (!(wide > 0 && a > 0)) return;
    let levels = 0;
    while (levels < MAX_LEVELS && wide / 2 ** levels >= WORK_WIDTH) levels++;
    const factor = 2 ** levels;
    const grow = wide / factor;
    const small = reduced(surface, levels, env);
    // The border's own edge: hard, or fading over a share of its width.
    const soft = Math.max(HARDEST, (params.softness * grow) / RAMP);
    const shape = edgeShape(soft, -grow, FOOTPRINT, env);
    let border = small;
    if (shape.blur > 0) {
      border = env.scratch(small.width, small.height, true);
      drawFiltered(border.ctx, small, `blur(${shape.blur}px)`, 0, env);
    }
    alphaToShape(border, shape.curve, [r, g, b]);
    const { ctx } = surface;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(border.canvas, 0, 0, border.width * factor, border.height * factor);
  },
};
