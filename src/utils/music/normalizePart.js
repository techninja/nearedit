/**
 * Normalising one part of a song. Isomorphic and pure.
 * @module utils/music/normalizePart
 */

import * as read from '#utils/web/coerce.js';
import { DRUM_NAMES } from './catalog/drums.js';
import { DEFAULT_KIT, KITS } from './catalog/kits.js';
import { SYNTH_PARAMS } from './catalog/synthParams.js';
import { fitLane, isSilentLane, laneLength } from './lanes.js';
import { SONG_LIMITS as LIMITS, PART_KINDS, STEP_COUNTS, defaultMix } from './limits.js';
import { cleanNotes, lastBeat } from './notes.js';
import { paramValue, presetName, presetParams } from './params.js';

/** @typedef {import('./types.js').Part} Part */

/** Other names a lane is known by, lower case. */
const ALIASES = {
  ...{ bd: 'kick', bassdrum: 'kick', sd: 'snare', cp: 'clap', rimshot: 'rim', hh: 'hat' },
  ...{ hihat: 'hat', closedhat: 'hat', ch: 'hat', oh: 'openHat', openhihat: 'openHat' },
  ...{ lowtom: 'tomLow', midtom: 'tomMid', hightom: 'tomHigh', cymbal: 'crash', cb: 'cowbell' },
};
const BY_LOWER = Object.fromEntries(DRUM_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * @param {string} name - A lane as it was written
 * @returns {string|undefined} The drum it means
 */
export function drumName(name) {
  const lower = typeof name === 'string' ? name.toLowerCase().replace(/[\s_-]/g, '') : '';
  return Object.hasOwn(BY_LOWER, lower) ? BY_LOWER[lower] : ALIASES[lower];
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
    .map(([from, to]) => [read.numberIn(from, NaN, min, max, true), read.numberIn(to, NaN, min, max, true)])
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
 * @param {Record<string, any>} from - A drum part as written
 * @param {number|undefined} bars - Its loop, when it says
 * @returns {Record<string, any>} `kit`, `steps`, `bars`, `lanes`
 */
function drumFields(from, bars) {
  const kit = read.textOf(read.own(from, 'kit'), 20);
  const steps = read.toNumber(read.own(from, 'steps'), 16);
  const perBar = STEP_COUNTS.includes(steps) ? steps : 16;
  /** @type {Record<string, any>} */
  const written = {};
  for (const [name, lane] of Object.entries(read.record(read.own(from, 'lanes'))).slice(0, 100)) {
    const drum = drumName(name);
    if (drum && typeof lane === 'string' && written[drum] === undefined) written[drum] = lane;
  }
  const longest = Math.max(0, ...Object.values(written).map((lane) => laneLength(lane.slice(0, 40000))));
  const loop = bars ?? Math.min(LIMITS.bars[1], Math.max(1, Math.ceil(longest / perBar)));
  /** @type {Record<string, string>} */
  const lanes = {};
  for (const name of DRUM_NAMES) {
    const lane = written[name] === undefined ? '' : fitLane(written[name], perBar * loop);
    if (!isSilentLane(lane)) lanes[name] = lane;
  }
  return { kit: Object.hasOwn(KITS, kit) ? kit : DEFAULT_KIT, steps: perBar, bars: loop, lanes };
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
  const bars = Number.isNaN(given) ? undefined : read.numberIn(given, 1, ...LIMITS.bars, true);
  const own = kind === 'drums' ? drumFields(from, bars) : synthFields(from, bars, beatsPerBar);
  const { bars: loop, ...rest } = own;
  const id = read.textOf(read.own(from, 'id'), LIMITS.id).replace(/[^\w-]/g, '');
  /** @type {any} */
  const part = {
    id,
    name: read.textOf(read.own(from, 'name'), LIMITS.name),
    kind,
    mute: read.boolOf(read.own(from, 'mute'), mix.mute),
    volume: read.numberIn(read.own(from, 'volume'), mix.volume, ...LIMITS.volume),
    pan: read.numberIn(read.own(from, 'pan'), mix.pan, ...LIMITS.pan),
    reverb: read.numberIn(read.own(from, 'reverb'), mix.reverb, ...LIMITS.send),
    delay: read.numberIn(read.own(from, 'delay'), mix.delay, ...LIMITS.send),
    bars: loop,
    play: cleanPlay(read.own(from, 'play')),
    ...rest,
  };
  return part;
}
