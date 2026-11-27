/**
 * Stylize — grayscale, sepia and invert, each by an amount, as CSS filter
 * functions (so it merges with neighbouring filter effects into one pass).
 * They apply in that order; at 0 a function is left out, and with all three
 * at 0 the effect does nothing.
 * @module utils/compose/effects/stylize
 */

/** @type {import('#utils/compose/params.js').ParamSpec} */
const amount = { type: 'number', default: 0, min: 0, max: 1, step: 0.01, animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'stylize',
  label: 'Stylize',
  category: 'stylize',
  description: 'Grayscale, sepia and invert, each by an amount',
  params: {
    grayscale: { ...amount, label: 'Grayscale' },
    sepia: { ...amount, label: 'Sepia' },
    invert: { ...amount, label: 'Invert' },
  },
  filter(params) {
    const parts = [];
    if (params.grayscale > 0) parts.push(`grayscale(${params.grayscale})`);
    if (params.sepia > 0) parts.push(`sepia(${params.sepia})`);
    if (params.invert > 0) parts.push(`invert(${params.invert})`);
    return parts.join(' ');
  },
};
