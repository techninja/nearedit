/**
 * Blur — Gaussian, or directional (motion blur along an angle).
 *
 * Gaussian: `radius` is the standard deviation in output pixels, as in CSS
 * `blur()`. Below 12 canvas pixels it is the canvas filter itself; from 12
 * up, the filter runs on a copy halved until the blur is 6 to 12 of its
 * pixels wide and the result is enlarged — the same picture, two to three
 * times cheaper (see `lib/reduce.js`). The layer's edge pixels are repeated
 * outward first, so a picture that fills the frame keeps solid borders.
 *
 * Directional: the layer is smeared `radius` output pixels each way along
 * `angle`, an even streak made of whole-pixel copies (`lib/directional.js`).
 * @module utils/compose/effects/blur
 */

import { drawFiltered, filterInPlace } from '#utils/compose/filterPass.js';
import { directionalBlur } from './lib/directional.js';
import { enlarge, reduce, reduceLevel } from './lib/reduce.js';

/**
 * Gaussian blur of a surface, in place.
 * @param {import('#utils/compose/pool.js').Surface} surface
 * @param {number} sigma - Standard deviation, canvas pixels
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 */
export function gaussianBlur(surface, sigma, env) {
  if (!(sigma > 0)) return;
  const levels = reduceLevel(sigma);
  if (levels === 0) return filterInPlace(surface, `blur(${sigma}px)`, sigma * 3, env);
  const { surface: small, factor } = reduce(surface, levels, env);
  const blurred = env.scratch(small.width, small.height);
  const reduced = sigma / factor;
  drawFiltered(blurred.ctx, small, `blur(${reduced}px)`, reduced * 3, env);
  const { ctx } = surface;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, surface.width, surface.height);
  enlarge(ctx, blurred, factor);
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'blur',
  label: 'Blur',
  category: 'blur',
  description: 'Gaussian blur, or motion blur along a direction',
  params: {
    kind: {
      type: 'select',
      default: 'gaussian',
      options: ['gaussian', 'directional'],
      label: 'Kind',
    },
    radius: {
      type: 'number',
      default: 8,
      min: 0,
      max: 200,
      unit: 'px',
      label: 'Radius',
      animatable: true,
    },
    angle: {
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      unit: '°',
      label: 'Direction',
      animatable: true,
      when: { kind: ['directional'] },
    },
  },
  apply(surface, params, _time, frame, env) {
    const radius = params.radius * frame.scale;
    if (params.kind === 'directional') directionalBlur(surface, radius, params.angle, env);
    else gaussianBlur(surface, radius, env);
  },
};
