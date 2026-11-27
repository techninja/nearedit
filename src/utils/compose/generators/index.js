/**
 * The generator list. To add a generator: write its module in this folder
 * (see README.md) and add it to the array below — nothing else.
 * @module utils/compose/generators
 */

import gradient from './gradient.js';
import noise from './noise.js';
import particles from './particles.js';
import pattern from './pattern.js';
import shape from './shape.js';
import solid from './solid.js';

/** Every generator, in the order menus list them. */
export default [solid, gradient, shape, pattern, noise, particles];
