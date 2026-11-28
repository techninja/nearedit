/**
 * Changes to a drum part's grid as pure functions from a part to a part:
 * one step, a painted run of steps, a whole lane (clear, shift, fill every
 * nth step), the kit and the number of steps in a bar.
 * @module utils/musicUi/drumEdit
 */

import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { KITS } from '#utils/music/catalog/kits.js';
import { fitLane, isSilentLane } from '#utils/music/lanes.js';
import { STEP_COUNTS } from '#utils/music/limits.js';

/** What a click turns a step into: rest → normal → accent → soft → rest. */
export const STEP_CYCLE = Object.freeze(['.', 'x', 'X', 'o']);
/** What each character is called. */
export const STEP_NAMES = Object.freeze({ '.': 'rest', o: 'soft', x: 'hit', X: 'accent' });

/**
 * @param {any} part - A drum part
 * @returns {number} Steps in its loop
 */
export const loopSteps = (part) => part.steps * part.bars;

/**
 * @param {any} part
 * @param {string} drum
 * @returns {string} The lane of a drum, as long as the loop, rests where nothing is written
 */
export function laneOf(part, drum) {
  return fitLane(part.lanes?.[drum] || '', loopSteps(part));
}

/**
 * @param {string} char
 * @returns {string} The next strength in `STEP_CYCLE`
 */
export function nextStep(char) {
  return STEP_CYCLE[(STEP_CYCLE.indexOf(char) + 1) % STEP_CYCLE.length];
}

/**
 * Write a lane back into a part; a lane without a hit is not stored.
 * @param {any} part
 * @param {string} drum
 * @param {string} lane
 * @returns {any} The same part when the lane is what it was
 */
export function setLane(part, drum, lane) {
  const fitted = fitLane(lane, loopSteps(part));
  if (!DRUM_NAMES.includes(drum) || fitted === laneOf(part, drum)) return part;
  const lanes = { ...part.lanes };
  if (isSilentLane(fitted)) delete lanes[drum];
  else lanes[drum] = fitted;
  return { ...part, lanes };
}

/**
 * Set steps of a lane to one strength.
 * @param {any} part
 * @param {string} drum
 * @param {number[]} steps - Steps of the loop
 * @param {string} char - `.`, `o`, `x` or `X`
 * @returns {any}
 */
export function paintSteps(part, drum, steps, char) {
  const lane = [...laneOf(part, drum)];
  for (const step of steps) if (step >= 0 && step < lane.length) lane[step] = char;
  return setLane(part, drum, lane.join(''));
}

/** @type {(part: any, drum: string) => any} Remove every hit of a lane */
export const clearLane = (part, drum) => setLane(part, drum, '');

/**
 * Move a lane's hits later (or earlier), around the loop.
 * @param {any} part
 * @param {string} drum
 * @param {number} by - Steps; negative is earlier
 * @returns {any}
 */
export function shiftLane(part, drum, by) {
  const lane = laneOf(part, drum);
  const turn = ((Math.round(by) % lane.length) + lane.length) % lane.length;
  return setLane(part, drum, lane.slice(lane.length - turn) + lane.slice(0, lane.length - turn));
}

/**
 * A hit on every nth step of a lane and nothing in between.
 * @param {any} part
 * @param {string} drum
 * @param {number} every - 1 = every step
 * @param {string} [char='x']
 * @returns {any}
 */
export function fillLane(part, drum, every, char = 'x') {
  const n = Math.max(1, Math.round(every) || 1);
  const lane = Array.from({ length: loopSteps(part) }, (_, step) => (step % n ? '.' : char));
  return setLane(part, drum, lane.join(''));
}

/**
 * A lane on another grid: every hit goes to the step that falls at the
 * same moment, or to the one just before it; where two meet, the harder stays.
 * @param {string} lane
 * @param {number} from - Steps per bar it was written on
 * @param {number} to - Steps per bar wanted
 * @returns {string}
 */
export function regridLane(lane, from, to) {
  const out = Array.from({ length: Math.round((lane.length * to) / from) }, () => '.');
  [...lane].forEach((char, step) => {
    const at = Math.floor((step * to) / from + 1e-9);
    if ('oxX'.indexOf(char) > 'oxX'.indexOf(out[at])) out[at] = char;
  });
  return out.join('');
}

/**
 * Divide the bars of a drum part into another number of steps, keeping
 * every hit where it falls in time.
 * @param {any} part
 * @param {number} steps - One of `STEP_COUNTS`
 * @returns {any}
 */
export function setSteps(part, steps) {
  if (!STEP_COUNTS.includes(steps) || steps === part.steps) return part;
  const lanes = Object.fromEntries(
    Object.entries(part.lanes).map(([drum, lane]) => [drum, regridLane(lane, part.steps, steps)]),
  );
  return { ...part, steps, lanes };
}

/**
 * @param {any} part
 * @param {string} kit - A name in `KITS`
 * @returns {any}
 */
export function setKit(part, kit) {
  return Object.hasOwn(KITS, kit) && kit !== part.kit ? { ...part, kit } : part;
}
