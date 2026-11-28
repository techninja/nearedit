/**
 * Writing the notes of a style's instruments: each part is a loop over the
 * chord progression — a bass line, held or struck chords, an arpeggio or a
 * melody — written by the engine's theory helpers from the seed, then
 * tidied (`tidy.js`).
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/parts
 */

import { presetParams } from '#utils/music/params.js';
import { bassLine } from '#utils/music/theory/bass.js';
import { arpeggio, padNotes } from '#utils/music/theory/chordParts.js';
import { melody } from '#utils/music/theory/melody.js';
import { note } from '#utils/music/theory/random.js';
import { voiceLead } from '#utils/music/theory/voicing.js';
import { MELODY_SPAN, ROLE_RANGE, foldInto, settle, spanOf, withinBars } from './tidy.js';

/** @typedef {import('#utils/music/types.js').Note} Note */
/** @typedef {import('./style.js').StylePart} StylePart */
/** @typedef {import('./harmony.js').Harmony} Harmony */

/** Seeds tried for a melody before one that spans too much is folded in. */
const TRIES = 12;

/**
 * Chords struck in a rhythm: every chord, voiced so that it moves as little
 * as it can from the one before, at each of the `hits` of its bar.
 * @param {import('#utils/music/theory/chords.js').Chord[]} chords
 * @param {{ beats: number, center?: number, hits: number[][], velocity?: number }} opts -
 *   `hits`: `[beat, length]` within a bar
 * @returns {Note[]}
 */
export function struckChords(chords, { beats, center, hits, velocity = 0.7 }) {
  return voiceLead(chords, { center }).flatMap((pitches, bar) =>
    hits
      .filter(([beat]) => beat < beats)
      .flatMap(([beat, length], i) =>
        pitches.map((pitch) =>
          note(bar * beats + beat, length, pitch, i ? velocity * 0.85 : velocity),
        ),
      ),
  );
}

/**
 * A melody over the progression played `repeat` times, within an octave
 * and a half: the first seed whose line keeps to that is taken.
 * @param {Harmony} harmony
 * @param {Record<string, any>} write
 * @param {number} beats
 * @param {number} seed
 * @returns {Note[]}
 */
function writeMelody(harmony, write, beats, seed) {
  const repeat = Math.max(1, Math.round(write.repeat) || 2);
  const chords = Array.from({ length: repeat }, () => harmony.chords).flat();
  const opts = { key: harmony.key, scale: harmony.scale, ...write, beats };
  /** @type {Note[]} */
  let line = [];
  for (let attempt = 0; attempt < TRIES; attempt++) {
    line = settle(melody(chords, { ...opts, seed: seed + attempt }), harmony.chords, beats);
    if (spanOf(line) <= MELODY_SPAN) break;
  }
  return line;
}

/**
 * @param {StylePart} spec
 * @param {Harmony} harmony
 * @param {number} beats - Beats per bar: one chord lasts a bar
 * @param {number} seed
 * @returns {Note[]} The part's loop
 */
export function writeNotes(spec, harmony, beats, seed) {
  const { chords } = harmony;
  const opts = { ...spec.write, beats, seed };
  /** @type {Note[]} */
  let notes;
  if (spec.role === 'bass') notes = bassLine(chords, opts);
  else if (spec.role === 'arp') notes = arpeggio(chords, opts);
  else if (spec.role === 'lead') notes = writeMelody(harmony, spec.write, beats, seed);
  else if (spec.write.hits) notes = struckChords(chords, /** @type {any} */ (opts));
  else notes = padNotes(chords, opts);
  return withinBars(foldInto(notes, ROLE_RANGE[spec.role]), beats);
}

/**
 * A part's synth parameters: the style's, with the filter opened or closed
 * by the brightness asked for — an octave either way at the extremes.
 * @param {string} preset
 * @param {Record<string, any>} params
 * @param {number} brightness - 0 (dark) … 1 (bright); 0.5 changes nothing
 * @returns {Record<string, any>}
 */
export function tone(preset, params, brightness) {
  if (!Number.isFinite(brightness) || Math.abs(brightness - 0.5) < 0.01) return { ...params };
  const cutoff = params.cutoff ?? presetParams(preset).cutoff;
  const moved = cutoff * 2 ** ((Math.min(1, Math.max(0, brightness)) - 0.5) * 2);
  return { ...params, cutoff: Math.round(Math.min(16000, Math.max(80, moved))) };
}

/**
 * @param {string} name
 * @returns {string} An id for a part of that name
 */
export const partId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * One instrument of a style as a part of a song — without its `play`
 * ranges, which the arrangement decides.
 * @param {StylePart} spec
 * @param {Harmony} harmony
 * @param {{ beats: number, seed: number, brightness?: number }} opts
 * @returns {Record<string, any>}
 */
export function writePart(spec, harmony, { beats, seed, brightness = 0.5 }) {
  const notes = writeNotes(spec, harmony, beats, seed);
  const last = notes.reduce((most, entry) => Math.max(most, entry[0]), 0);
  return {
    id: partId(spec.name),
    name: spec.name,
    kind: 'synth',
    preset: spec.preset,
    params: tone(spec.preset, spec.params, brightness),
    volume: spec.volume,
    pan: spec.pan,
    reverb: spec.reverb,
    delay: spec.delay,
    bars: Math.max(harmony.chords.length, Math.floor(last / beats + 1e-9) + 1),
    notes,
  };
}
