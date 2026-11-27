/**
 * Levels — set the black point and the white point, bend the midtones, and
 * squeeze the result into an output range:
 *
 *   x₁ = (x − black) / (white − black), clamped to 0..1
 *   x₂ = x₁ + midtones · x₁ · (1 − x₁)
 *   out = outBlack + (outWhite − outBlack) · x₂
 *
 * The midtone curve keeps black and white where they are and lifts
 * (positive) or lowers (negative) everything between: at −1 it is exactly
 * gamma 2 (x²), at +1 its mirror image. A true power curve is beyond what
 * canvases compute alike without a pixel loop; this one is plain blending
 * of the picture with itself (`multiply` or `screen`).
 *
 * Every step is a fill or a blend on the layer's straight colours
 * (`lib/straight.js`); alpha is untouched.
 * @module utils/compose/effects/levels
 */

import { blendFill, putStraight, straightCopy } from './lib/straight.js';

/**
 * What the effect does to a channel value, as arithmetic.
 * @param {number} x - 0..1
 * @param {Record<string, number>} p - The parameters
 * @returns {number} 0..1
 */
export function levelsCurve(x, p) {
  const span = Math.max(1 / 255, p.white - p.black);
  const a = Math.max(0, Math.min(1, (x - p.black) / span));
  const b = a + p.midtones * a * (1 - a);
  return p.outBlack + Math.max(0, p.outWhite - p.outBlack) * b;
}

/** @type {(value: number) => string} A grey, 0..1 */
const grey = (value) => {
  const level = Math.round(Math.max(0, Math.min(1, value)) * 255);
  return `rgb(${level}, ${level}, ${level})`;
};

/** @type {{ type: 'number', min: number, max: number, step: number, animatable: boolean }} */
const unit = { type: 'number', min: 0, max: 1, step: 0.005, animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'levels',
  label: 'Levels',
  category: 'color',
  description: 'Black point, white point, midtones and output range',
  params: {
    black: { ...unit, default: 0, label: 'Black point' },
    white: { ...unit, default: 1, label: 'White point' },
    midtones: { ...unit, min: -1, default: 0, label: 'Midtones' },
    outBlack: { ...unit, default: 0, label: 'Output black' },
    outWhite: { ...unit, default: 1, label: 'Output white' },
  },
  apply(surface, p, _time, _frame, env) {
    const neutral = p.black === 0 && p.white === 1 && p.midtones === 0;
    if (neutral && p.outBlack === 0 && p.outWhite === 1) return;
    const picture = straightCopy(surface, env);
    if (p.black > 0) {
      // max(0, x − black): invert, add, invert back.
      blendFill(picture, 'difference', '#ffffff');
      blendFill(picture, 'lighter', grey(p.black));
      blendFill(picture, 'difference', '#ffffff');
    }
    const span = Math.max(1 / 255, p.white - p.black);
    if (span < 1) blendFill(picture, 'color-dodge', grey(1 - span));
    if (p.midtones !== 0) {
      const copy = env.scratch(picture.width, picture.height);
      copy.ctx.drawImage(picture.canvas, 0, 0);
      // screen with itself is x + x(1 − x); multiply with itself x − x(1 − x).
      picture.ctx.globalCompositeOperation = p.midtones > 0 ? 'screen' : 'multiply';
      picture.ctx.globalAlpha = Math.abs(p.midtones);
      picture.ctx.drawImage(copy.canvas, 0, 0);
      picture.ctx.globalAlpha = 1;
    }
    const range = Math.max(0, p.outWhite - p.outBlack);
    if (range < 1) blendFill(picture, 'multiply', grey(range));
    if (p.outBlack > 0) blendFill(picture, 'lighter', grey(p.outBlack));
    putStraight(surface, picture);
  },
};
