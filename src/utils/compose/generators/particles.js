/**
 * Particles — snow, sparks, confetti, dust, a logo raining down: many
 * copies of one sprite, born by an emitter, moving and changing over their
 * lives. The system is stateless: which particles exist at a moment and
 * everything about each of them is computed from the parameters, the seed
 * and the clip's own time, so any frame can be drawn on its own, in any
 * order, on the browser and the server canvas alike.
 * Reference: docs/app-spec/PARTICLES.md.
 * @module utils/compose/generators/particles
 */

import { drawParticles } from './particles/draw.js';
import { PRESETS } from './particles/presets.js';
import { PARAMS } from './particles/schema.js';

export { PRESETS };

/** @type {import('#utils/compose/catalog.js').GeneratorModule} */
export default {
  type: 'particles',
  label: 'Particles',
  category: 'particles',
  description: 'Sprites or images born by an emitter: snow, sparks, confetti, dust, bursts',
  params: PARAMS,
  presets: PRESETS,
  draw: drawParticles,
};
