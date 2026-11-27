/**
 * The effect list. To add an effect: write its module in this folder (see
 * README.md) and add it to the array below — nothing else.
 * @module utils/compose/effects
 */

import blur from './blur.js';
import glow from './glow.js';

/** Every effect, in the order menus list them. */
export default [blur, glow];
