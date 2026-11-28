/**
 * Starting points of the Create tab's Music section: an empty song, every
 * named beat of the engine as a one-part song, and a handful of small
 * loops in different styles (`starterLoops.js`). Pure.
 * @module utils/musicUi/starters
 */

import { normalizeSong } from '#utils/music/normalize.js';
import { BEATS, drumPart } from '#utils/music/theory/beats.js';
import { BEAT_KITS, LOOPS, loopSong } from './starterLoops.js';

/**
 * @typedef {Object} Starter
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {'empty'|'beat'|'loop'} kind
 * @property {() => any} song - Builds the song (not normalised)
 */

/**
 * A named beat as a song: the pattern, looping, at a tempo it sits well at.
 * @param {string} name - A key of `BEATS`
 * @returns {any}
 */
function beatSong(name) {
  const beat = BEATS[name];
  const bpm = Math.round((beat.bpm[0] + beat.bpm[1]) / 2);
  return { bpm, swing: beat.swing, bars: 2, parts: [drumPart(name, { kit: BEAT_KITS[name] })] };
}

/** @type {Starter[]} Every starting point, in the order the tiles show */
export const STARTERS = [
  {
    id: 'empty',
    label: 'Empty song',
    description: 'Four bars at 120 BPM with an empty drum grid',
    kind: 'empty',
    song: () => ({ parts: [{ kind: 'drums', kit: '808', steps: 16, bars: 1, lanes: {} }] }),
  },
  ...Object.entries(BEATS).map(([name, beat]) => ({
    id: `beat:${name}`,
    label: beat.label,
    description: beat.description,
    kind: /** @type {'beat'} */ ('beat'),
    song: () => beatSong(name),
  })),
  ...LOOPS.map((loop) => ({
    ...loop,
    id: `loop:${loop.id}`,
    kind: /** @type {'loop'} */ ('loop'),
    song: () => loopSong(loop.id),
  })),
];

/**
 * @param {string} id
 * @returns {Starter|undefined}
 */
export const starterOf = (id) => STARTERS.find((starter) => starter.id === id);

/** @type {Map<string, any>} Starter songs as they are added, made once */
const songs = new Map();

/**
 * The song of a starting point, normalised. The same object every time, so
 * a tile that was heard is not rendered again.
 * @param {string} id
 * @returns {any|null} null for an unknown starting point
 */
export function starterSong(id) {
  const starter = starterOf(id);
  if (starter && !songs.has(id)) songs.set(id, normalizeSong(starter.song()));
  return songs.get(id) || null;
}
