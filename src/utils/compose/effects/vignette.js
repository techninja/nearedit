/**
 * Vignette — the frame darkens (or takes any colour) towards its corners.
 * One gradient painted onto the layer with `source-atop`, so it tints what
 * the layer shows and leaves transparent areas transparent.
 *
 * Distances are measured from the centre as a fraction of the way to the
 * frame's corner: 0 at the centre, 1 at the corner. The tint is nothing up
 * to `size − softness / 2`, rises along an S-curve, and reaches `amount` at
 * `size + softness / 2`. `roundness` 0 follows the frame's shape (an
 * ellipse through the corners), 1 is a circle.
 * @module utils/compose/effects/vignette
 */

import { parseColor } from '#utils/compose/color.js';
import { opacityStops, smooth, spread } from './lib/soft.js';

/** @type {{ type: 'number', min: number, max: number, step: number, animatable: boolean }} */
const unit = { type: 'number', min: 0, max: 1, step: 0.01, animatable: true };

/**
 * Opacity of the vignette at a distance from the centre.
 * @param {number} distance - 0 at the centre, 1 at the frame's corner
 * @param {{ amount: number, size: number, softness: number }} params
 * @returns {number} 0..amount
 */
export function vignetteAt(distance, { amount, size, softness }) {
  if (!(softness > 0)) return distance >= size ? amount : 0;
  return amount * smooth((distance - size) / softness + 0.5);
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'vignette',
  label: 'Vignette',
  category: 'light',
  description: 'Darkens or tints the frame towards its corners',
  params: {
    amount: { ...unit, default: 0.6, label: 'Amount' },
    size: { ...unit, max: 1.5, default: 0.7, label: 'Size' },
    softness: { ...unit, max: 2, default: 0.6, label: 'Softness' },
    roundness: { ...unit, default: 0, label: 'Roundness' },
    color: { type: 'color', default: '#000000', label: 'Colour', animatable: true },
    center: { type: 'point', default: { x: 0.5, y: 0.5 }, label: 'Centre', animatable: true },
  },
  apply(surface, params, _time, frame) {
    if (!(params.amount > 0)) return;
    const { ctx } = surface;
    const { width, height } = frame;
    const half = Math.hypot(width, height) / 2;
    // A unit circle stretched to pass through the corners (roundness 0) or to a true circle (1).
    const rx = (width / Math.SQRT2) * (1 - params.roundness) + half * params.roundness;
    const ry = (height / Math.SQRT2) * (1 - params.roundness) + half * params.roundness;
    // Never sharper than about a pixel, so a hard vignette still has a clean edge.
    const softness = Math.max(params.softness, 1.5 / Math.min(rx, ry));
    const from = Math.max(0, params.size - softness / 2);
    const to = params.size + softness / 2;
    // Far enough out to cover the frame from wherever the centre is.
    const far = Math.max(to, 4);
    const [r, g, b, a] = parseColor(params.color);
    const shape = { amount: params.amount, size: params.size, softness };
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, far);
    opacityStops(
      gradient,
      (position) => a * vignetteAt(position * far, shape),
      spread(from / far, to / far),
      [r, g, b],
    );
    ctx.setTransform(rx, 0, 0, ry, params.center.x * width, params.center.y * height);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = gradient;
    ctx.fillRect(-far, -far, far * 2, far * 2);
  },
};
