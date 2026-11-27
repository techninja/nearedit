/**
 * Blur — a Gaussian blur, as a filter effect. `radius` is the standard
 * deviation in output pixels, as in CSS `blur()`.
 * @module utils/compose/effects/blur
 */

/** @type {import('../catalog.js').EffectModule} */
export default {
  type: 'blur',
  label: 'Blur',
  category: 'blur',
  description: 'Gaussian blur',
  params: {
    radius: {
      type: 'number',
      default: 8,
      min: 0,
      max: 200,
      unit: 'px',
      label: 'Radius',
      animatable: true,
    },
  },
  filter: (params, frame) => (params.radius > 0 ? `blur(${params.radius * frame.scale}px)` : ''),
  // A Gaussian is all but spent three standard deviations out.
  reach: (params, frame) => params.radius * frame.scale * 3,
};
