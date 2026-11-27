/**
 * Chroma key — make one colour transparent (a green or blue screen), with a
 * soft edge and spill suppression. The arithmetic is in `lib/chroma.js`.
 *
 * This is the one effect a canvas has no operation for, so it reads the
 * pixels: one pass over a typed array at the canvas's own size (about
 * 10 ms at 1920×1080, a quarter of that on a 960-pixel preview).
 * @module utils/compose/effects/chromaKey
 */

import { parseColor } from '#utils/compose/color.js';
import { keyPixels } from './lib/chroma.js';
import { editPixels } from './lib/pixels.js';

/** @type {{ type: 'number', min: number, max: number, step: number, animatable: boolean }} */
const unit = { type: 'number', min: 0, max: 1, step: 0.005, animatable: true };

/** @type {import('#utils/compose/catalog.js').EffectModule} */
export default {
  type: 'chromaKey',
  label: 'Chroma key',
  category: 'key',
  description: 'Makes a colour transparent, with a soft edge and spill suppression',
  params: {
    color: { type: 'color', default: '#00ff00', label: 'Key colour', animatable: true },
    tolerance: { ...unit, default: 0.2, label: 'Tolerance' },
    softness: { ...unit, default: 0.1, label: 'Softness' },
    spill: { ...unit, default: 0.5, label: 'Spill suppression' },
  },
  apply(surface, params) {
    const [r, g, b] = parseColor(params.color);
    editPixels(surface, (data) =>
      keyPixels(data, [r, g, b], params.tolerance, params.softness, params.spill),
    );
  },
};
