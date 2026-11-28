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

/** @type {readonly Drum[]} */
export const DRUMS = Object.freeze(
  [
    ['kick', 'Kick', 36],
    ['snare', 'Snare', 38],
    ['clap', 'Clap', 39],
    ['rim', 'Rim', 37],
    ['hat', 'Closed hat', 42],
    ['openHat', 'Open hat', 46],
    ['tomLow', 'Low tom', 43],
    ['tomMid', 'Mid tom', 47],
    ['tomHigh', 'High tom', 50],
    ['crash', 'Crash', 49],
    ['ride', 'Ride', 51],
    ['cowbell', 'Cowbell', 56],
    ['shaker', 'Shaker', 70],
  ].map(([name, label, gm]) => Object.freeze({ name, label, gm })),
);

/** The lane names, in order. */
export const DRUM_NAMES = Object.freeze(DRUMS.map((drum) => drum.name));

/** A closed hat cuts the ringing open one off. */
export const CHOKES = Object.freeze({ hat: 'openHat' });
