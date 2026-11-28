/**
 * Normalising one part of a song. Isomorphic and pure.
 * @module utils/music/normalizePart
 */

import * as read from '#utils/web/coerce.js';
import { SYNTH_PARAMS } from './catalog/synthParams.js';
import { SONG_LIMITS as LIMITS, PART_KINDS, defaultMix } from './limits.js';
import { drumFields } from './normalizeDrums.js';
import { cleanNotes, lastBeat } from './notes.js';
import { paramValue, presetName, presetParams } from './params.js';

/** @typedef {import('./types.js').Part} Part */

/**
 * @param {any} value
 * @param {number} fallback
 * @param {readonly number[]} range - `[min, max]`
 * @param {boolean} [integer]
 * @returns {number} A number inside the range
 */
export function within(value, fallback, range, integer) {
  return read.numberIn(value, fallback, range[0], range[1], integer);
}

/**
 * @param {any} raw - A part as written
 * @returns {'drums'|'synth'|null} Its kind: the one it names, else the one
 *   its `lanes` or `notes` give away
 */
export function partKind(raw) {
  const from = read.record(raw);
  const kind = read.own(from, 'kind');
  if (PART_KINDS.includes(kind)) return kind;
  if (read.own(from, 'lanes') !== undefined) return 'drums';
  return read.own(from, 'notes') !== undefined ? 'synth' : null;
}

/**
 * The bars in which a part sounds: whole bars, in order, not overlapping.
 * @param {any} raw
 * @returns {number[][]}
 */
export function cleanPlay(raw) {
  const [min, max] = [0, LIMITS.bars[1]];
  const ranges = (Array.isArray(raw) ? raw.slice(0, LIMITS.ranges * 4) : [])
    .filter((range) => Array.isArray(range))
    .map(([from, to]) => [
      read.numberIn(from, NaN, min, max, true),
      read.numberIn(to, NaN, min, max, true),
    ])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {number[][]} */
  const merged = [];
  for (const [from, to] of ranges) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else if (merged.length < LIMITS.ranges) merged.push([from, to]);
  }
  return merged;
}

/**
 * @param {Record<string, any>} from - A synth part as written
 * @param {number|undefined} bars
 * @param {number} beatsPerBar
 * @returns {Record<string, any>} `preset`, `params`, `transpose`, `bars`, `notes`
 */
function synthFields(from, bars, beatsPerBar) {
  const preset = presetName(read.own(from, 'preset'));
  const base = presetParams(preset);
  const stored = read.record(read.own(from, 'params'));
  /** @type {Record<string, any>} */
  const params = {};
  for (const name of Object.keys(SYNTH_PARAMS)) {
    const value = paramValue(name, read.own(stored, name), base[name]);
    if (value !== base[name]) params[name] = value;
  }
  const notes = read.own(from, 'notes');
  const needed = Math.floor(lastBeat(notes) / beatsPerBar + 1e-9) + 1;
  const loop = bars ?? Math.min(LIMITS.bars[1], needed);
  const [low, high] = LIMITS.transpose;
  const transpose = read.numberIn(read.own(from, 'transpose'), 0, low, high, true);
  return { preset, params, transpose, bars: loop, notes: cleanNotes(notes, loop * beatsPerBar) };
}

/**
 * Normalise one part.
 * @param {any} raw
 * @param {number} beatsPerBar - Of the song
 * @returns {Part|null} null for anything that is neither a drum nor a synth
 *   part. Its `id` is as written ('' when none): the song makes ids unique
 */
export function normalizePart(raw, beatsPerBar) {
  const kind = partKind(raw);
  if (!kind) return null;
  const from = read.record(raw);
  const mix = defaultMix();
  const given = read.toNumber(read.own(from, 'bars'), NaN);
  const bars = Number.isNaN(given) ? undefined : within(given, 1, LIMITS.bars, true);
  const own = kind === 'drums' ? drumFields(from, bars) : synthFields(from, bars, beatsPerBar);
  const { bars: loop, ...rest } = own;
  const id = read.textOf(read.own(from, 'id'), LIMITS.id).replace(/[^\w-]/g, '');
  /** @type {any} */
  const part = {
    id,
    name: read.textOf(read.own(from, 'name'), LIMITS.name),
    kind,
    mute: read.boolOf(read.own(from, 'mute'), mix.mute),
    volume: within(read.own(from, 'volume'), mix.volume, LIMITS.volume),
    pan: within(read.own(from, 'pan'), mix.pan, LIMITS.pan),
    reverb: within(read.own(from, 'reverb'), mix.reverb, LIMITS.send),
    delay: within(read.own(from, 'delay'), mix.delay, LIMITS.send),
    bars: loop,
    play: cleanPlay(read.own(from, 'play')),
    ...rest,
  };
  return part;
}
