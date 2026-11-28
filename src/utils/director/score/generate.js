/**
 * The generator: a style, a tempo, a layout of sections and a seed in — a
 * song out. Every note is written by rule from the seed; the same input
 * always gives the same song, another seed another take in the same style.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/generate
 */

import { SONG_LIMITS } from '#utils/music/limits.js';
import { seeded } from '#utils/music/theory/random.js';
import { arrange } from './arrange.js';
import { cadenceBass, cadenceChords } from './cadence.js';
import { drumLayers, drumsFrom, fillPart } from './drums.js';
import { harmonyOf } from './harmony.js';
import { writePart } from './parts.js';

/** @typedef {import('./style.js').Style} Style */
/** @typedef {import('./sections.js').Section} Section */

/** Seconds a song rings on after its last bar, at least. */
const TAIL = 3;
/**
 * A sparse arrangement is quieter than a full one. The mix bus makes up
 * part of the difference — this many decibels per unit of mean energy,
 * around the energy the styles' levels were set at — so that beds of any
 * energy come out about equally loud.
 */
const MAKE_UP = 6;
const SET_AT = 0.55;

/**
 * @param {Section[]} sections
 * @param {number} bars
 * @returns {number} The gain that evens out how much plays
 */
export function makeUp(sections, bars) {
  const mean = sections.reduce((sum, s) => sum + s.energy * (s.to - s.from), 0) / bars;
  return 10 ** ((MAKE_UP * (SET_AT - mean)) / 20);
}

/**
 * @typedef {Object} SongInput
 * @property {Style} style
 * @property {number} bpm
 * @property {number} bars - Whole bars of music
 * @property {Section[]} sections - Covering `0 … bars`
 * @property {number} [seed]
 * @property {string} [key] - A key that was asked for
 * @property {number} [brightness] - 0 (dark) … 1 (bright)
 * @property {number} [rest] - Seconds the song must ring on after its last
 *   bar to reach the end of the span
 */

/**
 * Write a song.
 * @param {SongInput} input
 * @returns {{ song: Record<string, any>, harmony: import('./harmony.js').Harmony }} The
 *   song as the engine takes it (`normalizeSong` completes it)
 */
export function generateSong({ style, bpm, bars, sections, seed = 1, key, brightness, rest = 0 }) {
  const random = seeded(seed);
  const harmony = harmonyOf(style, { key, random });
  const beats = style.beatsPerBar;
  const plan = arrange(sections, bars, drumsFrom(style));
  const short = bars < 2;
  /** @type {Record<string, any>[]} */
  const parts = [];
  /** A part is in the song only where it plays; one that never does is left out. */
  const add = (/** @type {Record<string, any>|null} */ part, /** @type {number[][]} */ play) => {
    if (part && play.length) parts.push({ ...part, play });
  };
  for (const layer of drumLayers(style)) add(layer.part, plan.layers(layer.from));
  add(fillPart(style), plan.fills());
  /** @type {Partial<Record<import('./style.js').Role, import('./style.js').StylePart>>} */
  const first = {};
  for (const spec of style.parts) {
    first[spec.role] ??= spec;
    // Every part draws its own seed, in the style's order, whether or not it plays.
    const own = Math.floor(random() * 1e9);
    add(writePart(spec, harmony, { beats, seed: own, brightness }), plan.loops(spec.from));
  }
  const volume = style.master.volume * makeUp(sections, bars);
  const closing = { beats, short, brightness };
  if (first.chords) add(cadenceChords(first.chords, harmony, closing), plan.turns(0));
  if (first.bass) add(cadenceBass(first.bass, harmony, closing), plan.turns(first.bass.from));
  return {
    harmony,
    song: {
      bpm,
      beatsPerBar: beats,
      bars,
      swing: style.swing,
      key: harmony.key,
      scale: harmony.scale,
      tail: Math.min(SONG_LIMITS.tail[1], Math.max(TAIL, Math.ceil(rest + 1))),
      master: { ...style.master, volume: Math.round(volume * 1000) / 1000 },
      parts,
    },
  };
}
