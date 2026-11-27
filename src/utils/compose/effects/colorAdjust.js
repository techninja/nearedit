/**
 * Colour adjust — brightness, exposure, contrast, saturation and hue, as
 * one chain of CSS filter functions (so it merges with neighbouring filter
 * effects into a single pass). Brightness and exposure are the same gain,
 * one as a multiplier and one in photographic stops; they are folded into
 * one function. A neutral setting adds nothing to the chain, and with all
 * of them neutral the effect does nothing at all.
 *
 * Canvas filters work on 8-bit colours and clamp after every function:
 * brightness, then contrast (about mid grey), then saturation, then hue.
 * @module utils/compose/effects/colorAdjust
 */

/** @type {{ type: 'number', min: number, max: number, step: number, animatable: boolean }} */
const gain = { type: 'number', min: 0, max: 4, step: 0.01, animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'colorAdjust',
  label: 'Colour adjust',
  category: 'color',
  description: 'Brightness, exposure, contrast, saturation and hue',
  params: {
    brightness: { ...gain, default: 1, label: 'Brightness' },
    exposure: {
      type: 'number',
      default: 0,
      min: -4,
      max: 4,
      step: 0.05,
      unit: 'stops',
      label: 'Exposure',
      animatable: true,
    },
    contrast: { ...gain, default: 1, label: 'Contrast' },
    saturation: { ...gain, default: 1, label: 'Saturation' },
    hue: {
      type: 'number',
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: '°',
      label: 'Hue',
      animatable: true,
    },
  },
  filter(params) {
    const parts = [];
    const brightness = params.brightness * 2 ** params.exposure;
    if (brightness !== 1) parts.push(`brightness(${brightness})`);
    if (params.contrast !== 1) parts.push(`contrast(${params.contrast})`);
    if (params.saturation !== 1) parts.push(`saturate(${params.saturation})`);
    if (params.hue % 360 !== 0) parts.push(`hue-rotate(${params.hue}deg)`);
    return parts.join(' ');
  },
};
