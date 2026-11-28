/**
 * General MIDI, as far as a song needs it: which kit drum each percussion
 * note of channel 10 is nearest to, and which preset stands for each family
 * of instruments. Isomorphic and pure.
 * @module utils/music/midi/gm
 */

import { DRUMS } from '#utils/music/catalog/drums.js';

/** The MIDI channel (counted from 0) that plays drums. */
export const DRUM_CHANNEL = 9;

/**
 * The percussion notes of General MIDI each drum of a kit stands for: its
 * own, and those of the instruments nearest to it.
 * @type {Readonly<Record<string, readonly number[]>>}
 */
const NEAREST = Object.freeze({
  kick: [35, 36],
  snare: [38, 40],
  clap: [39],
  rim: [37, 75, 76, 77],
  hat: [42, 44],
  openHat: [46],
  tomLow: [41, 43, 64],
  tomMid: [45, 47, 61, 63, 66],
  tomHigh: [48, 50, 60, 62, 65],
  crash: [49, 52, 55, 57],
  ride: [51, 53, 59],
  cowbell: [56, 67, 68],
  shaker: [54, 69, 70, 82],
});

/**
 * Percussion note → the drum of a kit that is nearest to it.
 * @type {Readonly<Record<number, string>>}
 */
export const GM_DRUMS = Object.freeze(
  Object.fromEntries(
    Object.entries(NEAREST).flatMap(([drum, notes]) => notes.map((note) => [note, drum])),
  ),
);

/** Drum → the percussion note it is written as. */
export const DRUM_NOTES = Object.freeze(
  Object.fromEntries(DRUMS.map((drum) => [drum.name, drum.gm])),
);

/** Preset → the program it is written as (counted from 0). */
export const PRESET_PROGRAMS = Object.freeze({
  bass: 38,
  sub: 39,
  acid: 87,
  pluck: 46,
  keys: 4,
  organ: 16,
  pad: 89,
  strings: 48,
  lead: 80,
  bell: 14,
  arp: 81,
});

const BY_PROGRAM = Object.fromEntries(
  Object.entries(PRESET_PROGRAMS).map(([preset, program]) => [program, preset]),
);

/**
 * The sixteen families of General MIDI programs, eight programs each, with
 * the preset that stands for each; '' = nothing in the synth comes near.
 */
export const GM_FAMILIES = Object.freeze(
  [
    ['Piano', 'keys'],
    ['Chromatic percussion', 'bell'],
    ['Organ', 'organ'],
    ['Guitar', 'pluck'],
    ['Bass', 'bass'],
    ['Strings', 'strings'],
    ['Ensemble', 'strings'],
    ['Brass', 'lead'],
    ['Reed', 'lead'],
    ['Pipe', 'lead'],
    ['Synth lead', 'lead'],
    ['Synth pad', 'pad'],
    ['Synth effects', 'pad'],
    ['Ethnic', 'pluck'],
    ['Percussive', 'bell'],
    ['Sound effects', ''],
  ].map(([label, preset]) => Object.freeze({ label, preset })),
);

/**
 * @param {number} program - 0 … 127
 * @returns {{ label: string, preset: string }} The family of a program and
 *   the preset for it: the very preset `songToMidi` wrote that program for,
 *   else the family's
 */
export function programPreset(program) {
  const family = GM_FAMILIES[Math.min(15, Math.max(0, Math.floor(program / 8)))];
  const exact = Object.hasOwn(BY_PROGRAM, program) ? BY_PROGRAM[program] : '';
  return { label: family.label, preset: exact || family.preset };
}
