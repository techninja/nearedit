/**
 * The piano roll's geometry and what it shows: pitch rows from the top
 * note down, beats from the left, where a note's box is, which cell is
 * under a pointer, which rows belong to the song's scale, and the grids a
 * roll can have. Pure.
 * @module utils/musicUi/rollModel
 */

import { noteName } from '#utils/music/theory/names.js';
import { inScale, snapToScale } from '#utils/music/theory/scales.js';
import { snapTo } from './noteEdit.js';

/** Height of a pitch row, pixels. */
export const ROW = 12;
/** Width of a beat, pixels. */
export const BEAT = 44;
/** The highest pitch has the first row. */
export const TOP = 127;

/** Grids a roll can have: `[beats between lines, label]`. */
export const GRIDS = Object.freeze([
  [1, '1 beat'],
  [0.5, '1/2 beat'],
  [1 / 3, '1/3 (triplets)'],
  [0.25, '1/4 beat'],
  [0.125, '1/8 beat'],
  [0, 'No grid'],
]);

/** @type {(value: number, low: number, high: number) => number} */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * @param {number} pitch
 * @returns {number} Pixels from the top of the roll to the row of a pitch
 */
export const rowTop = (pitch) => (TOP - pitch) * ROW;

/**
 * Where a note is drawn.
 * @param {number[]} note - `[beat, length, pitch, velocity]`
 * @returns {{ left: string, top: string, width: string }} CSS lengths
 */
export function noteBox([beat, length, pitch]) {
  return {
    left: `${beat * BEAT}px`,
    top: `${rowTop(pitch)}px`,
    width: `${Math.max(4, length * BEAT - 1)}px`,
  };
}

/**
 * What is under a point of the roll.
 * @param {number} x - Pixels from the left of the note area
 * @param {number} y - Pixels from its top
 * @param {number} loop - Beats of the part's loop
 * @returns {{ beat: number, pitch: number }} `beat` is not snapped
 */
export function cellAt(x, y, loop) {
  return {
    beat: clamp(x / BEAT, 0, Math.max(0, loop - 1e-6)),
    pitch: clamp(TOP - Math.floor(y / ROW), 0, TOP),
  };
}

/**
 * The start of the grid cell a beat falls in.
 * @param {number} beat
 * @param {number} grid - Beats between lines; 0 = no grid
 * @returns {number}
 */
export function cellStart(beat, grid) {
  return grid > 0 ? snapTo(Math.floor(beat / grid + 1e-6) * grid, grid) : beat;
}

/**
 * How pitches settle: on the song's scale when asked, else where they are.
 * @param {{ key: string, scale: string }} song
 * @param {boolean} snap
 * @returns {(pitch: number) => number}
 */
export function pitchFit(song, snap) {
  return snap
    ? (pitch) => clamp(snapToScale(pitch, song.key, song.scale), 0, TOP)
    : (pitch) => pitch;
}

/**
 * The keys at the left of the roll, from the top note down.
 * @param {{ key: string, scale: string }} song
 * @returns {{ pitch: number, name: string, black: boolean, scale: boolean, label: string }[]}
 *   `label` is shown on every C
 */
export function rollKeys(song) {
  return Array.from({ length: TOP + 1 }, (_, row) => {
    const pitch = TOP - row;
    const name = noteName(pitch);
    return {
      pitch,
      name,
      black: name.includes('#'),
      scale: inScale(pitch, song.key, song.scale),
      label: pitch % 12 === 0 ? name : '',
    };
  });
}

/**
 * A background that shades the rows outside the song's scale: one octave
 * of bands, repeated up the roll.
 * @param {{ key: string, scale: string }} song
 * @returns {string} A CSS `linear-gradient`; `var(--roll-out)` is the shade
 */
export function scaleBands(song) {
  const bands = [];
  for (let row = 0; row < 12; row++) {
    // The first row is the top pitch; twelve rows further down is the same note again.
    const colour = inScale(TOP - row, song.key, song.scale) ? 'transparent' : 'var(--roll-out)';
    bands.push(`${colour} ${row * ROW}px ${(row + 1) * ROW}px`);
  }
  return `linear-gradient(${bands.join(', ')})`;
}

/**
 * Where the roll should first be scrolled to: its notes in the middle, or
 * the octaves around middle C for an empty part.
 * @param {number[][]} notes
 * @param {number} height - Of the view, pixels
 * @returns {number} `scrollTop`
 */
export function firstScroll(notes, height) {
  const pitches = notes.map((note) => note[2]);
  const middle = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 60;
  return Math.max(0, rowTop(middle) + ROW / 2 - height / 2);
}
