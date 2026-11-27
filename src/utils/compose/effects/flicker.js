/**
 * Flicker — the layer's brightness or opacity wavers from moment to moment,
 * like an old projector or a failing lamp. The level is a function of the
 * time alone (deterministic noise keyed by `variant`), so any frame can be
 * drawn on its own. A filter effect: one CSS function.
 * @module utils/compose/effects/flicker
 */

import { noise2, rand, seedOf } from '#utils/compose/random.js';

/**
 * The level at a moment: 1 at rest, lower (and for brightness also higher)
 * as `amount` grows.
 * @param {Record<string, any>} params
 * @param {import('#utils/compose/frame.js').Time} time
 * @returns {number}
 */
export function flickerLevel(params, time) {
  const seed = seedOf(params.variant);
  // rate 0 changes on every output frame; otherwise `rate` times a second.
  const at = params.rate > 0 ? time.t * params.rate : time.frame;
  const n = params.smooth && params.rate > 0 ? noise2(at, 0, seed) : rand(seed, Math.floor(at));
  if (params.mode === 'opacity') return 1 - params.amount * n;
  return Math.max(0, 1 + params.amount * (2 * n - 1));
}

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'flicker',
  label: 'Flicker',
  category: 'light',
  description: 'Brightness or opacity that wavers over time',
  params: {
    mode: {
      type: 'select',
      default: 'brightness',
      options: ['brightness', 'opacity'],
      label: 'Flickers',
    },
    amount: {
      type: 'number',
      default: 0.15,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      animatable: true,
    },
    rate: {
      type: 'number',
      default: 12,
      min: 0,
      max: 60,
      step: 1,
      unit: '/s',
      label: 'Changes per second (0 = every frame)',
    },
    smooth: { type: 'boolean', default: false, label: 'Glide between levels' },
    variant: { type: 'number', default: 1, min: 0, max: 9999, step: 1, label: 'Variant' },
  },
  filter(params, _frame, time) {
    if (!(params.amount > 0)) return '';
    const level = flickerLevel(params, time);
    if (level === 1) return '';
    return params.mode === 'opacity' ? `opacity(${level})` : `brightness(${level})`;
  },
};
