/**
 * The parameter schema of the particle generator, in the order an editor
 * lists it: emitter, flow, motion, sprite and size, turning, colour and
 * opacity. Reference: docs/app-spec/PARTICLES.md § Parameters.
 * @module utils/compose/generators/particles/schema
 */

import { emitterParams, flowParams, motionParams } from './schemaFlow.js';
import { shadeParams, spriteParams, turnParams } from './schemaLook.js';

/** @typedef {import('#utils/compose/params.js').ParamSchema} ParamSchema */

/**
 * Mark every parameter of a part with the section an editor lists it under.
 * @param {string} group
 * @param {ParamSchema} params
 * @returns {ParamSchema}
 */
const grouped = (group, params) =>
  Object.fromEntries(Object.entries(params).map(([name, spec]) => [name, { ...spec, group }]));

/** @type {ParamSchema} */
export const PARAMS = {
  ...grouped('Emitter', emitterParams),
  ...grouped('Flow', flowParams),
  ...grouped('Motion', motionParams),
  ...grouped('Sprite and size', spriteParams),
  ...grouped('Turning', turnParams),
  ...grouped('Colour and opacity', shadeParams),
};
