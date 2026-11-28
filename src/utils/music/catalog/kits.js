/**
 * The drum kits. Every kit has the same thirteen drums (`DRUMS`), each
 * described by the settings of the drum synthesiser — so a kit is data and
 * no samples are shipped. Isomorphic and pure.
 * @module utils/music/catalog/kits
 */

import acoustic from './kits/acoustic.js';
import lofi from './kits/lofi.js';
import tr808 from './kits/tr808.js';
import tr909 from './kits/tr909.js';

/** @typedef {import('./kits/build.js').Kit} Kit */

/**
 * Every kit by name.
 * @type {Readonly<Record<string, Kit>>}
 */
export const KITS = Object.freeze({ 808: tr808, 909: tr909, acoustic, lofi });

/** The kit of a drum part that names none, or one that does not exist. */
export const DEFAULT_KIT = '808';
