/**
 * Colour balance — white balance and per-channel gain. `temperature` warms
 * (red up, blue down) or cools; `tint` leans to magenta (green down) or to
 * green; `red`, `green` and `blue` scale a channel directly. Together:
 *
 *   R × red   × (1 + 0.3 · temperature)
 *   G × green × (1 − 0.3 · tint)
 *   B × blue  × (1 − 0.3 · temperature)
 *
 * A canvas filter cannot scale channels separately, so this is two fills on
 * the layer's straight colours (`lib/straight.js`): `multiply` for the
 * gains below one, `color-dodge` — which divides — for those above. Alpha
 * is untouched.
 * @module utils/compose/effects/colorBalance
 */

import { blendFill, putStraight, straightCopy } from './lib/straight.js';

/** How far a full temperature or tint swing moves a channel. */
export const BALANCE_SWING = 0.3;

/**
 * The gain of each channel.
 * @param {Record<string, number>} params
 * @returns {number[]} `[r, g, b]`, 1 = unchanged
 */
export function channelGains(params) {
  return [
    params.red * (1 + BALANCE_SWING * params.temperature),
    params.green * (1 - BALANCE_SWING * params.tint),
    params.blue * (1 - BALANCE_SWING * params.temperature),
  ];
}

/** @type {(parts: number[]) => string} Channels 0..1 as a CSS colour */
const rgb = (parts) => `rgb(${parts.map((v) => Math.round(v * 255)).join(', ')})`;

/** @type {{ type: 'number', step: number, animatable: boolean }} */
const slider = { type: 'number', step: 0.01, animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'colorBalance',
  label: 'Colour balance',
  category: 'color',
  description: 'Temperature, tint and red / green / blue gain',
  params: {
    temperature: { ...slider, default: 0, min: -1, max: 1, label: 'Temperature' },
    tint: { ...slider, default: 0, min: -1, max: 1, label: 'Tint' },
    red: { ...slider, default: 1, min: 0, max: 4, label: 'Red' },
    green: { ...slider, default: 1, min: 0, max: 4, label: 'Green' },
    blue: { ...slider, default: 1, min: 0, max: 4, label: 'Blue' },
  },
  apply(surface, params, _time, _frame, env) {
    const gains = channelGains(params);
    if (gains.every((gain) => gain === 1)) return;
    const picture = straightCopy(surface, env);
    if (gains.some((gain) => gain < 1)) {
      blendFill(picture, 'multiply', rgb(gains.map((gain) => Math.min(1, gain))));
    }
    if (gains.some((gain) => gain > 1)) {
      // x / (1 − c) is x × gain when c = 1 − 1 / gain.
      blendFill(picture, 'color-dodge', rgb(gains.map((gain) => 1 - 1 / Math.max(1, gain))));
    }
    putStraight(surface, picture);
  },
};
