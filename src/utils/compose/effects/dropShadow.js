/**
 * Drop shadow — a blurred, offset, coloured copy of the layer's alpha drawn
 * behind it: the CSS `drop-shadow()` filter function, so it merges with
 * neighbouring filter effects into one pass. `blur` is the standard
 * deviation of the Gaussian, as in the blur effect. The shadow follows
 * whatever is opaque in the layer, soft edges included, and falls outside
 * the layer's own rectangle.
 * @module utils/compose/effects/dropShadow
 */

import { withAlpha } from '#utils/compose/color.js';

/** @type {{ type: 'number', unit: string, animatable: boolean }} A length in output pixels */
const px = { type: 'number', unit: 'px', animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'dropShadow',
  label: 'Drop shadow',
  category: 'light',
  description: 'A soft shadow behind the layer, following its shape',
  params: {
    x: { ...px, default: 12, min: -500, max: 500, label: 'Offset X' },
    y: { ...px, default: 12, min: -500, max: 500, label: 'Offset Y' },
    blur: { ...px, default: 8, min: 0, max: 200, label: 'Blur' },
    color: { type: 'color', default: '#000000', label: 'Colour', animatable: true },
    opacity: {
      type: 'number',
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Opacity',
      animatable: true,
    },
  },
  filter(params, frame) {
    if (!(params.opacity > 0)) return '';
    const s = frame.scale;
    const color = withAlpha(params.color, params.opacity);
    return `drop-shadow(${params.x * s}px ${params.y * s}px ${params.blur * s}px ${color})`;
  },
  // The shadow is the layer seen from `offset` away through a blur of 3 deviations.
  reach: (params, frame) =>
    (Math.max(Math.abs(params.x), Math.abs(params.y)) + params.blur * 3) * frame.scale,
};
