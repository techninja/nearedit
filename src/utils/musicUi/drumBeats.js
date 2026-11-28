/**
 * Named beats on a drum part: "Beat…" replaces the part's lanes with one
 * of `BEATS` in every bar, "Fill" writes that beat's fill into the last
 * bar. A part does not store which beat it came from, so the beat of a
 * part is found again: by its name, else by the lanes it shares. Pure.
 * @module utils/musicUi/drumBeats
 */

import { BEATS } from '#utils/music/theory/beats.js';
import { laneOf, regridLane } from './drumEdit.js';
import { resizeLoop } from './partEdit.js';

/** Bars a one-bar pattern is given before a fill is written into the last. */
const FILL_LOOP = 4;

/** @returns {{ name: string, label: string, description: string }[]} The beats, for a menu */
export function beatChoices() {
  return Object.entries(BEATS).map(([name, beat]) => ({
    name,
    label: beat.label,
    description: beat.description,
  }));
}

/**
 * Replace a drum part's lanes with a named beat, in every bar of its loop.
 * The part takes the beat's grid; a part that had no name of its own (or a
 * beat's name) is named after the beat.
 * @param {any} part
 * @param {string} name - A key of `BEATS`
 * @returns {any} The same part for an unknown beat
 */
export function applyBeat(part, name) {
  const beat = Object.hasOwn(BEATS, name) ? BEATS[name] : null;
  if (!beat) return part;
  const lanes = Object.fromEntries(
    Object.entries(beat.lanes).map(([drum, lane]) => [drum, lane.repeat(part.bars)]),
  );
  const labels = Object.values(BEATS).map((each) => each.label);
  const renamed = !part.name || labels.includes(part.name) ? beat.label : part.name;
  return { ...part, name: renamed, steps: beat.steps, lanes };
}

/**
 * The beat a part plays: the one it is named after, else the one whose
 * lanes its first bar shares most of, else the backbeat.
 * @param {any} part - A drum part
 * @returns {string} A key of `BEATS`
 */
export function beatOf(part) {
  const named = Object.keys(BEATS).find((name) => BEATS[name].label === part.name);
  if (named) return named;
  let best = 'backbeat';
  let most = 0;
  for (const [name, beat] of Object.entries(BEATS)) {
    const shared = Object.entries(beat.lanes).filter(([drum, lane]) => {
      return regridLane(lane, beat.steps, part.steps) === laneOf(part, drum).slice(0, part.steps);
    }).length;
    if (shared > most) [best, most] = [name, shared];
  }
  return best;
}

/**
 * Write the fill of the part's beat into the last bar of its loop: the
 * drums the fill names play it, the others keep their bar. A one-bar loop
 * is first made four bars long, so the fill comes round every fourth bar
 * instead of replacing the pattern.
 * @param {any} song - For the bar's length
 * @param {any} part - A drum part
 * @param {string} [name] - The beat whose fill it is; default `beatOf(part)`
 * @returns {any}
 */
export function addFill(song, part, name = beatOf(part)) {
  const beat = Object.hasOwn(BEATS, name) ? BEATS[name] : BEATS[beatOf(part)];
  const long = part.bars < 2 ? resizeLoop(song, part, FILL_LOOP) : part;
  const start = (long.bars - 1) * long.steps;
  const lanes = { ...long.lanes };
  for (const [drum, lane] of Object.entries(beat.fill)) {
    const fill = regridLane(lane, beat.steps, long.steps);
    lanes[drum] = laneOf(long, drum).slice(0, start) + fill;
  }
  return { ...long, lanes };
}
