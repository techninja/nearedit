/**
 * Glow — light spreading from the bright parts of the layer: a blurred copy
 * of what is brighter than `threshold`, added back on top. The halo spills
 * past the layer's own edges.
 *
 * The halo is light and nothing else. It is made from the layer over black
 * (so a dark or transparent area gives off none), cut at the threshold and
 * blurred by one canvas filter, then given just enough alpha to carry its
 * colour — the one step that needs a pixel loop, since no canvas operation
 * turns brightness into alpha. That loop never sees the full frame: the
 * whole halo is made on a reduced copy, halved at least once and then on
 * until the blur is 2 to 4 of its pixels wide (`lib/reduce.js`) — coarser
 * than a blur on its own could be, which a soft layer of added light hides
 * completely.
 * @module utils/compose/effects/glow
 */

import { drawFiltered } from '#utils/compose/filterPass.js';
import { enlarge, reduce, reduceLevel } from './lib/reduce.js';

/** The blur on the reduced copy is at least this wide, in its pixels. */
const HALO_FLOOR = 2;

/**
 * Turn an opaque picture of light on black into light with alpha: each
 * pixel's alpha becomes its brightest channel (times `gain`), its colour
 * what that alpha has to carry.
 * @param {any} ctx - Context of the picture
 * @param {number} width
 * @param {number} height
 * @param {number} gain - Intensity, 0 and up
 */
export function lightToAlpha(ctx, width, height, gain) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const peak = Math.max(r, g, b) * gain;
    if (peak <= 0) {
      data[i + 3] = 0;
      continue;
    }
    // Past full brightness the colour clips channel by channel, as light does.
    const alpha = Math.min(255, peak);
    const scale = (255 * gain) / alpha;
    data[i] = r * scale;
    data[i + 1] = g * scale;
    data[i + 2] = b * scale;
    data[i + 3] = alpha;
  }
  ctx.putImageData(image, 0, 0);
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'glow',
  label: 'Glow',
  category: 'light',
  description: 'Adds a soft bloom around bright areas and edges',
  params: {
    radius: {
      type: 'number',
      default: 20,
      min: 0,
      max: 200,
      unit: 'px',
      label: 'Radius',
      animatable: true,
    },
    intensity: {
      type: 'number',
      default: 0.8,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'Intensity',
      animatable: true,
    },
    threshold: {
      type: 'number',
      default: 0,
      min: 0,
      max: 0.95,
      step: 0.01,
      label: 'Threshold',
      animatable: true,
    },
  },
  apply(surface, params, _time, frame, env) {
    const sigma = params.radius * frame.scale;
    if (!(sigma > 0 && params.intensity > 0)) return;
    const levels = Math.max(1, reduceLevel(sigma, HALO_FLOOR));
    const { surface: small, factor } = reduce(surface, levels, env);
    const { width, height } = small;
    const light = env.scratch(width, height);
    light.ctx.fillStyle = '#000000';
    light.ctx.fillRect(0, 0, width, height);
    light.ctx.drawImage(small.canvas, 0, 0);
    // (x − t) / (1 − t), clamped: what is brighter than the threshold, rescaled.
    const t = params.threshold;
    const cut = t > 0 ? `brightness(${1 / (1 + t)}) contrast(${(1 + t) / (1 - t)}) ` : '';
    const reduced = sigma / factor;
    const halo = env.scratch(width, height);
    drawFiltered(halo.ctx, light, `${cut}blur(${reduced}px)`, reduced * 3, env);
    lightToAlpha(halo.ctx, width, height, params.intensity);
    const { ctx } = surface;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    enlarge(ctx, halo, factor);
  },
};
