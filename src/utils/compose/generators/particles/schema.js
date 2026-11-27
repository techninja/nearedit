/**
 * The parameter schema of the particle generator, in the order an editor
 * lists it: emitter, flow, motion, sprite and size, turning, colour and
 * opacity. Reference: docs/app-spec/PARTICLES.md § Parameters.
 * @module utils/compose/generators/particles/schema
 */

import { emitterParams, flowParams, motionParams } from './schemaFlow.js';
import { shadeParams, spriteParams, turnParams } from './schemaLook.js';

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const PARAMS = {
  ...emitterParams,
  ...flowParams,
  ...motionParams,
  ...spriteParams,
  ...turnParams,
  ...shadeParams,
};
