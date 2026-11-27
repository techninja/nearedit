/**
 * Particle parameters, first half: where particles are born (the emitter),
 * when (the flow) and how they travel (the motion). Lengths are output
 * pixels, speeds output pixels per second, angles degrees clockwise with 0°
 * pointing up. Reference: docs/app-spec/PARTICLES.md.
 * @module utils/compose/generators/particles/schemaFlow
 */

import { fixed, flag, num, pick, share } from './spec.js';

/** Emitter shapes: where on the emitter a particle is born. */
export const EMITTERS = ['point', 'line', 'box', 'circle', 'ring', 'edge'];

const wide = { emitter: EMITTERS.slice(1) };
const tall = { emitter: EMITTERS.slice(2) };

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const emitterParams = {
  emitter: pick(EMITTERS, 'Emitter shape'),
  position: {
    type: 'point',
    default: { x: 0.5, y: 0.5 },
    label: 'Emitter position',
    animatable: true,
  },
  emitterWidth: num(0.5, 0, 4, 'Emitter width (of frame)', { step: 0.005, when: wide }),
  emitterHeight: num(0.5, 0, 4, 'Emitter height (of frame)', { step: 0.005, when: tall }),
  emitterRotation: num(0, -3600, 3600, 'Emitter rotation', { unit: '°', when: wide }),
  driftX: fixed(0, -8000, 8000, 'Emitter travel X', { unit: 'px/s' }),
  driftY: fixed(0, -8000, 8000, 'Emitter travel Y', { unit: 'px/s' }),
};

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const flowParams = {
  rate: fixed(60, 0, 20000, 'Particles per second', { unit: '/s' }),
  density: share(1, 'Density'),
  emitFor: fixed(0, 0, 3600, 'Emit for (0 = always)', { unit: 's' }),
  prewarm: flag(false, 'Start with the field full'),
  burst: fixed(0, 0, 20000, 'Burst size', { step: 1 }),
  burstEvery: fixed(0, 0, 3600, 'Repeat the burst every (0 = once)', { unit: 's' }),
  lifetime: fixed(3, 0.05, 120, 'Lifetime', { unit: 's' }),
  lifetimeJitter: fixed(0.3, 0, 1, 'Lifetime variation', { step: 0.01 }),
  maxParticles: fixed(3000, 10, 20000, 'Most particles alive', { step: 1 }),
};

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const motionParams = {
  speed: num(250, 0, 20000, 'Speed', { unit: 'px/s' }),
  speedJitter: share(0.3, 'Speed variation'),
  direction: num(0, -3600, 3600, 'Direction (0 = up)', { unit: '°' }),
  spread: num(360, 0, 360, 'Spread', { unit: '°' }),
  radial: num(0, -20000, 20000, 'Speed away from the centre', { unit: 'px/s', when: wide }),
  gravityX: num(0, -20000, 20000, 'Gravity X', { unit: 'px/s²' }),
  gravityY: num(0, -20000, 20000, 'Gravity Y', { unit: 'px/s²' }),
  drag: num(0, 0, 20, 'Drag', { unit: '/s', step: 0.01 }),
  swirl: num(0, -3600, 3600, 'Swirl about the emitter', { unit: '°/s' }),
  turbulence: num(0, 0, 4000, 'Turbulence', { unit: 'px' }),
  turbulenceScale: fixed(300, 10, 8000, 'Turbulence feature size', { unit: 'px' }),
  turbulenceSpeed: fixed(0.5, 0, 20, 'Turbulence change', { unit: '/s', step: 0.01 }),
};
