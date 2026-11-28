/**
 * The choices the music editor's dropdowns offer, from the engine's tables:
 * keys, scales, kits and steps to a bar. Also the number specs of the
 * fields of a song and of a part. Pure.
 * @module utils/musicUi/choices
 */

import { KITS } from '#utils/music/catalog/kits.js';
import { SONG_LIMITS, STEP_COUNTS } from '#utils/music/limits.js';
import { KEY_NAMES } from '#utils/music/theory/names.js';
import { SCALES } from '#utils/music/theory/scales.js';

/** @typedef {[string, string][]} Choices - `[value, label]` */

/** @type {Choices} */
export const KEY_CHOICES = KEY_NAMES.map((name) => [name, name]);
/** @type {Choices} */
export const SCALE_CHOICES = Object.entries(SCALES).map(([name, scale]) => [name, scale.label]);
/** @type {Choices} */
export const KIT_CHOICES = Object.values(KITS).map((kit) => [kit.name, kit.label]);
/** @type {Choices} */
export const STEP_CHOICES = STEP_COUNTS.map((steps) => [String(steps), `${steps} steps`]);

/**
 * @param {readonly number[]} range - `[min, max]`
 * @param {number} step
 * @param {Record<string, any>} [more] - `decimals`, `unit`, `scale`
 * @returns {import('#utils/inspector/numberField.js').NumberSpec}
 */
const spec = (range, step, more = {}) => ({ min: range[0], max: range[1], step, ...more });

/** Number specs of the fields the editor shows, by the name of the field. */
export const NUMBER_SPECS = Object.freeze({
  bpm: spec(SONG_LIMITS.bpm, 1, { decimals: 1, unit: 'BPM' }),
  swing: spec(SONG_LIMITS.swing, 0.01, { scale: 100, unit: '%' }),
  bars: spec(SONG_LIMITS.bars, 1),
  beatsPerBar: spec(SONG_LIMITS.beatsPerBar, 1),
  tail: spec(SONG_LIMITS.tail, 0.1, { decimals: 1, unit: 's' }),
  volume: spec(SONG_LIMITS.volume, 0.01, { scale: 100, unit: '%' }),
  pan: spec(SONG_LIMITS.pan, 0.01, { scale: 100 }),
  send: spec(SONG_LIMITS.send, 0.01, { scale: 100, unit: '%' }),
  share: spec([0, 1], 0.01, { scale: 100, unit: '%' }),
  transpose: spec(SONG_LIMITS.transpose, 1, { unit: 'st' }),
  delayBeats: spec(SONG_LIMITS.delayBeats, 0.0625, { decimals: 2, unit: 'beats' }),
  feedback: spec(SONG_LIMITS.feedback, 0.01, { scale: 100, unit: '%' }),
});

/**
 * The options of a dropdown.
 * @param {Choices} choices
 * @param {string} value - The one that is chosen
 * @returns {{ value: string, label: string, selected: boolean }[]}
 */
export function options(choices, value) {
  return choices.map(([each, label]) => ({ value: each, label, selected: each === value }));
}
