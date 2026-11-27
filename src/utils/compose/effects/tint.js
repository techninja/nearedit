/**
 * Tint — colourise the layer, by an amount.
 *
 * `colorize` gives every pixel the hue and saturation of one colour and
 * keeps its own lightness (the `color` blend mode): black stays black,
 * white stays white, everything between takes the tint.
 * `duotone` maps lightness onto a ramp between two colours: black becomes
 * `shadows`, white becomes `highlights`.
 *
 * Both are composite operations on the layer's straight colours
 * (`lib/straight.js`), so the layer's alpha is untouched and soft edges get
 * no fringe. Lightness is 0.30 R + 0.59 G + 0.11 B, as the blend modes
 * define it.
 * @module utils/compose/effects/tint
 */

import { cssColor } from '#utils/compose/color.js';
import { blendFill, putStraight, straightCopy } from './lib/straight.js';

/**
 * Turn an opaque picture into a two-colour ramp over its lightness.
 * @param {import('#utils/compose/pool.js').Surface} picture - Opaque; changed in place
 * @param {string} shadows - Colour of black
 * @param {string} highlights - Colour of white
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 */
function duotone(picture, shadows, highlights, env) {
  // A grey fill in `color` mode leaves each pixel's lightness as a grey.
  blendFill(picture, 'color', '#808080');
  const dark = env.scratch(picture.width, picture.height);
  dark.ctx.drawImage(picture.canvas, 0, 0);
  // (1 − L) × shadows  +  L × highlights
  blendFill(dark, 'difference', '#ffffff');
  blendFill(dark, 'multiply', shadows);
  blendFill(picture, 'multiply', highlights);
  picture.ctx.globalCompositeOperation = 'lighter';
  picture.ctx.drawImage(dark.canvas, 0, 0);
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'tint',
  label: 'Tint',
  category: 'color',
  description: 'Colourise towards one colour, or map shadows and highlights to two',
  params: {
    mode: { type: 'select', default: 'colorize', options: ['colorize', 'duotone'], label: 'Mode' },
    amount: {
      type: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      animatable: true,
    },
    color: {
      type: 'color',
      default: '#f59e0b',
      label: 'Colour',
      animatable: true,
      when: { mode: ['colorize'] },
    },
    shadows: {
      type: 'color',
      default: '#1e1b4b',
      label: 'Shadows',
      animatable: true,
      when: { mode: ['duotone'] },
    },
    highlights: {
      type: 'color',
      default: '#fde68a',
      label: 'Highlights',
      animatable: true,
      when: { mode: ['duotone'] },
    },
  },
  apply(surface, params, _time, _frame, env) {
    if (!(params.amount > 0)) return;
    const picture = straightCopy(surface, env);
    if (params.mode === 'duotone') {
      duotone(picture, cssColor(params.shadows), cssColor(params.highlights), env);
    } else {
      blendFill(picture, 'color', cssColor(params.color));
    }
    putStraight(surface, picture, params.amount);
  },
};
