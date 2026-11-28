/**
 * The parts of a song from the notes of a MIDI file. Isomorphic and pure.
 * @module utils/music/midi/importParts
 */

import { laneFromVelocities } from '#utils/music/lanes.js';
import { SONG_LIMITS as LIMITS } from '#utils/music/limits.js';
import { GM_DRUMS, programPreset } from './gm.js';

/** @typedef {import('./parse.js').MidiNote} MidiNote */
/** @typedef {{ beatsPerBar: number, bars: number, ticks: number, name: string }} Frame */

/** Grids tried for a drum part, coarsest first; triplet grids after straight ones. */
const GRIDS = [8, 16, 12, 24, 32];
/** A hit this far off its step, in steps, still counts as on it. */
const ON_GRID = 0.08;

/**
 * @param {MidiNote[]} notes
 * @param {Frame} frame
 * @returns {number} The coarsest grid every hit lies on; 16 when none fits
 */
function gridOf(notes, frame) {
  for (const steps of GRIDS) {
    const off = notes.some((note) => {
      const place = (note.tick / frame.ticks) * (steps / frame.beatsPerBar);
      return Math.abs(place - Math.round(place)) > ON_GRID;
    });
    if (!off) return steps === 8 ? 16 : steps;
  }
  return 16;
}

/**
 * A drum part from the notes of one track on channel 10.
 * @param {MidiNote[]} notes
 * @param {Frame & { kit: string, steps: number }} frame - `steps` 0 = find the grid
 * @param {string[]} warnings - Added to
 * @returns {Record<string, any>|null} null when no note is a drum of a kit
 */
export function importDrums(notes, frame, warnings) {
  const steps = frame.steps || gridOf(notes, frame);
  const length = steps * frame.bars;
  /** @type {Record<string, number[]>} */
  const hits = {};
  /** @type {Map<number, number>} */
  const lost = new Map();
  for (const note of notes) {
    const drum = GM_DRUMS[note.pitch];
    const step = Math.round((note.tick / frame.ticks) * (steps / frame.beatsPerBar));
    if (!drum) lost.set(note.pitch, (lost.get(note.pitch) || 0) + 1);
    if (!drum || step >= length) continue;
    hits[drum] ||= new Array(length).fill(0);
    // The three strengths of a lane: soft below 70, an accent from 110.
    const loud = note.velocity >= 110 ? 1 : note.velocity >= 70 ? 0.75 : 0.4;
    hits[drum][step] = Math.max(hits[drum][step], loud);
  }
  for (const [pitch, count] of lost) {
    warnings.push(`Percussion note ${pitch} has no drum in a kit: ${count} hits are left out`);
  }
  if (!Object.keys(hits).length) return null;
  const lanes = Object.fromEntries(
    Object.entries(hits).map(([drum, row]) => [drum, laneFromVelocities(row)]),
  );
  return { kind: 'drums', name: frame.name, kit: frame.kit, steps, bars: frame.bars, lanes };
}

/**
 * A synth part from the notes of one track and channel.
 * @param {MidiNote[]} notes
 * @param {Frame} frame
 * @param {string[]} warnings - Added to
 * @returns {Record<string, any>|null} null when no preset stands for its program
 */
export function importSynth(notes, frame, warnings) {
  const { label, preset } = programPreset(notes[0].program);
  const where = `Channel ${notes[0].channel + 1}${frame.name ? ` (${frame.name})` : ''}`;
  if (!preset) {
    warnings.push(
      `${where} plays ${label.toLowerCase()}, which the synth has no sound for: left out`,
    );
    return null;
  }
  if (notes.some((note) => note.program !== notes[0].program)) {
    warnings.push(`${where} changes its instrument; the first one (${label}) is used throughout`);
  }
  if (notes.length > LIMITS.notes) {
    warnings.push(`${where} has ${notes.length} notes; the first ${LIMITS.notes} are kept`);
  }
  const round = (value) => Math.round(value * 10000) / 10000;
  const written = notes
    .slice(0, LIMITS.notes)
    .map((note) => [
      round(note.tick / frame.ticks),
      round(Math.max(1, note.ticks) / frame.ticks),
      note.pitch,
      round(note.velocity / 127),
    ]);
  return { kind: 'synth', name: frame.name, preset, bars: frame.bars, notes: written };
}
