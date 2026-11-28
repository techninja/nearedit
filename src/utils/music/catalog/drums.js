/**
 * The drums every kit has, in the order a drum grid shows them, with the
 * General MIDI note each stands for. Isomorphic and pure.
 * @module utils/music/catalog/drums
 */

/**
 * @typedef {Object} Drum
 * @property {string} name - The lane a drum part stores its hits under
 * @property {string} label
 * @property {number} gm - Its note on MIDI channel 10
 */

/**
 * @param {string} name
 * @param {string} label
 * @param {number} gm
 * @returns {Drum}
 */
const drum = (name, label, gm) => Object.freeze({ name, label, gm });

/** @type {readonly Drum[]} */
export const DRUMS = Object.freeze([
  drum('kick', 'Kick', 36),
  drum('snare', 'Snare', 38),
  drum('clap', 'Clap', 39),
  drum('rim', 'Rim', 37),
  drum('hat', 'Closed hat', 42),
  drum('openHat', 'Open hat', 46),
  drum('tomLow', 'Low tom', 43),
  drum('tomMid', 'Mid tom', 47),
  drum('tomHigh', 'High tom', 50),
  drum('crash', 'Crash', 49),
  drum('ride', 'Ride', 51),
  drum('cowbell', 'Cowbell', 56),
  drum('shaker', 'Shaker', 70),
]);

/** The lane names, in order. */
export const DRUM_NAMES = Object.freeze(DRUMS.map((drum) => drum.name));

/** A closed hat cuts the ringing open one off. */
export const CHOKES = Object.freeze({ hat: 'openHat' });
