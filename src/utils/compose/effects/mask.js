/**
 * Mask — keep a rectangle, rounded rectangle or ellipse of the layer and
 * drop the rest (or the reverse, with `invert`): spotlights, windows,
 * picture-in-picture shapes. The shape sits in the frame, not in the clip:
 * its centre and size are fractions of the frame, its corner radius and
 * feather output pixels.
 *
 * A feathered edge is the shape blurred, `feather` being about the width of
 * the fade. The blur runs on a small mask — reduced until the blur is a
 * pixel or two wide, and clipped to the shape — never on the layer itself.
 * @module utils/compose/effects/mask
 */

import { enlarge, reduceLevel } from './lib/reduce.js';

/** A feather this many standard deviations wide looks `feather` pixels wide. */
const FEATHER_SIGMAS = 3;

/**
 * Trace the mask's shape, centred on the origin.
 * @param {any} ctx
 * @param {string} shape - `rectangle` or `ellipse`
 * @param {number} w - Width, pixels
 * @param {number} h - Height, pixels
 * @param {number} radius - Corner radius of a rectangle, pixels
 */
function tracePath(ctx, shape, w, h, radius) {
  ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (radius > 0) ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(radius, w / 2, h / 2));
  else ctx.rect(-w / 2, -h / 2, w, h);
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'mask',
  label: 'Mask',
  category: 'key',
  description: 'Keeps a rectangle, rounded rectangle or ellipse of the layer',
  params: {
    shape: {
      type: 'select',
      default: 'ellipse',
      options: ['rectangle', 'ellipse'],
      label: 'Shape',
    },
    center: { type: 'point', default: { x: 0.5, y: 0.5 }, label: 'Centre', animatable: true },
    width: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.005,
      label: 'Width (of frame)',
      animatable: true,
    },
    height: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.005,
      label: 'Height (of frame)',
      animatable: true,
    },
    rotation: { type: 'number', default: 0, min: -3600, max: 3600, unit: '°', animatable: true },
    radius: {
      type: 'number',
      default: 0,
      min: 0,
      max: 4000,
      unit: 'px',
      label: 'Corner radius',
      animatable: true,
      when: { shape: ['rectangle'] },
    },
    feather: {
      type: 'number',
      default: 0,
      min: 0,
      max: 1000,
      unit: 'px',
      label: 'Feather',
      animatable: true,
    },
    invert: { type: 'boolean', default: false, label: 'Invert' },
  },
  apply(surface, params, _time, frame, env) {
    const { width, height, scale } = frame;
    const w = params.width * width;
    const h = params.height * height;
    const sigma = (params.feather * scale) / FEATHER_SIGMAS;
    // Reduce until the blur is 1.5 to 3 mask pixels wide; a hard edge stays full size.
    const factor = 2 ** reduceLevel(sigma, 1.5);
    const mask = env.scratch(Math.ceil(width / factor), Math.ceil(height / factor));
    const m = mask.ctx;
    if (w > 0 && h > 0) {
      const turn = (params.rotation * Math.PI) / 180;
      // Only the shape's surroundings need blurring: a filter costs what its clip covers.
      const reach = Math.hypot(w, h) / 2 + sigma * 3 + 2;
      m.scale(1 / factor, 1 / factor);
      m.translate(params.center.x * width, params.center.y * height);
      m.beginPath();
      m.rect(-reach, -reach, reach * 2, reach * 2);
      m.clip();
      m.rotate(turn);
      if (sigma > 0) m.filter = `blur(${sigma / factor}px)`;
      tracePath(m, params.shape, w, h, params.radius * scale);
      m.fill();
    }
    const { ctx } = surface;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = params.invert ? 'destination-out' : 'destination-in';
    enlarge(ctx, mask, factor);
  },
};
