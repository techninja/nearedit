/**
 * What the drum grid shows: which drums have a row — those with hits and
 * the ones that are always at hand, the rest folded away under "more" —
 * and what every step is called. Pure.
 * @module utils/musicUi/gridModel
 */

import { DRUMS } from '#utils/music/catalog/drums.js';
import { isSilentLane } from '#utils/music/lanes.js';
import { STEP_NAMES, laneOf } from './drumEdit.js';

/** Drums a grid shows even while they are silent, so an empty part can be written on. */
const AT_HAND = ['kick', 'snare', 'hat', 'clap'];

/**
 * @typedef {Object} DrumRow
 * @property {string} name - The lane
 * @property {string} label
 * @property {string} lane - One character a step, as long as the loop
 */

/**
 * The rows of a drum part's grid.
 * @param {any} part - A drum part
 * @param {{ all?: boolean, kept?: Iterable<string> }} [opts] - `all`: every
 *   drum of the kit; `kept`: drums that stay although they have gone silent
 *   (a row does not vanish under the pointer that emptied it)
 * @returns {{ rows: DrumRow[], more: number }} `more`: drums folded away
 */
export function drumRows(part, opts = {}) {
  const kept = new Set(opts.kept || []);
  const shown = DRUMS.filter(({ name }) => {
    const silent = isSilentLane(part.lanes?.[name] || '');
    return opts.all || !silent || kept.has(name) || AT_HAND.includes(name);
  });
  const rows = shown.map(({ name, label }) => ({ name, label, lane: laneOf(part, name) }));
  return { rows, more: DRUMS.length - rows.length };
}

/**
 * What a step is called, for a screen reader.
 * @param {string} label - The drum
 * @param {number} step - Step of the loop
 * @param {number} steps - Steps to a bar
 * @param {string} char - What the step holds
 * @returns {string} `Kick, bar 1 step 5: accent`
 */
export function stepLabel(label, step, steps, char) {
  const bar = Math.floor(step / steps) + 1;
  return `${label}, bar ${bar} step ${(step % steps) + 1}: ${STEP_NAMES[char] || 'rest'}`;
}

/**
 * Where a step stands in its bar, for the shading of the grid.
 * @param {number} step
 * @param {number} steps - Steps to a bar
 * @param {number} beatsPerBar
 * @returns {'bar'|'beat'|''} The first step of a bar, of a beat, or neither
 */
export function stepPlace(step, steps, beatsPerBar) {
  if (step % steps === 0) return 'bar';
  const perBeat = steps / beatsPerBar;
  return Number.isInteger(perBeat) && step % perBeat === 0 ? 'beat' : '';
}

/**
 * The step under a pointer.
 * @param {{ left: number, width: number }} rect - Of the row of steps
 * @param {number} clientX
 * @param {number} count - Steps in the row
 * @returns {number} Inside 0 … count − 1
 */
export function stepAt(rect, clientX, count) {
  const share = (clientX - rect.left) / Math.max(1, rect.width);
  return Math.max(0, Math.min(count - 1, Math.floor(share * count)));
}
