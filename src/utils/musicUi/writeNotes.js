/**
 * "Write…" — the theory helpers of the engine put to work on a synth
 * part: a chord progression (one of a few common ones in the song's key,
 * or typed: `Am F C G`, `i-VI-III-VII`), one chord to a bar, played as a
 * bass line, held chords, an arpeggio or a melody. The part's loop becomes
 * as long as the progression. Everything that looks like a choice comes
 * from the seed, so the same form writes the same notes. Pure.
 * @module utils/musicUi/writeNotes
 */

import { SONG_LIMITS } from '#utils/music/limits.js';
import { BASS_STYLES, bassLine } from '#utils/music/theory/bass.js';
import { ARP_MODES, arpeggio, padNotes } from '#utils/music/theory/chordParts.js';
import { melody } from '#utils/music/theory/melody.js';
import { progression } from '#utils/music/theory/roman.js';
import { scaleSteps } from '#utils/music/theory/scales.js';

/** @typedef {import('#utils/music/types.js').Note} Note */

/** Progressions offered in a key whose third is minor, and in one whose third is major. */
const COMMON = {
  minor: ['i-VI-III-VII', 'i-iv-v-i', 'i-VII-VI-VII', 'i-iv-VI-v', 'i-VI-iv-v'],
  major: ['I-V-vi-IV', 'I-vi-IV-V', 'ii-V-I-I', 'I-IV-V-IV', 'vi-IV-I-V'],
};

/**
 * What can be written, with the choice each one has.
 * @type {Readonly<Record<string, { label: string, option: string, options: readonly string[] }>>}
 */
export const WRITERS = Object.freeze({
  bass: { label: 'Bass line', option: 'Style', options: BASS_STYLES },
  pad: { label: 'Chords', option: '', options: [] },
  arp: { label: 'Arpeggio', option: 'Order', options: ARP_MODES },
  melody: { label: 'Melody', option: '', options: [] },
});

/**
 * @typedef {Object} WriteForm
 * @property {string} what - A key of `WRITERS`
 * @property {string} sequence - Numerals or chord names
 * @property {string} option - A style of `BASS_STYLES` or a mode of `ARP_MODES`
 * @property {number} seed
 */

/**
 * The names of the chords a sequence means in a key.
 * @param {string} key
 * @param {string} scale
 * @param {string} sequence
 * @returns {string[]} Empty when nothing of it can be read
 */
export function chordNames(key, scale, sequence) {
  return progression(key, scale, sequence).map((chord) => chord.name);
}

/**
 * A few common progressions in a song's key.
 * @param {string} key
 * @param {string} scale
 * @returns {{ sequence: string, names: string }[]} Numerals, and the chords they are here
 */
export function progressionChoices(key, scale) {
  const kind = scaleSteps(scale).includes(4) ? 'major' : 'minor';
  return COMMON[kind].map((sequence) => ({
    sequence,
    names: chordNames(key, scale, sequence).join(' '),
  }));
}

/**
 * @param {any} song
 * @returns {WriteForm} What the form starts with
 */
export function defaultWriteForm(song) {
  const [first] = progressionChoices(song.key, song.scale);
  return { what: 'bass', sequence: first.sequence, option: BASS_STYLES[0], seed: 1 };
}

/**
 * The option of a form as its writer understands it.
 * @param {WriteForm} form
 * @returns {string} One of the writer's options, its first for anything else
 */
export function writerOption(form) {
  const { options } = WRITERS[form.what] || WRITERS.bass;
  return options.includes(form.option) ? form.option : options[0] || '';
}

/**
 * Write a part's notes.
 * @param {any} song - For its key, scale and beats per bar
 * @param {any} part - A synth part
 * @param {WriteForm} form
 * @returns {{ part: any, problem: string }} The part with its new notes and
 *   a loop as long as the progression; `problem` says why nothing was written
 */
export function writePart(song, part, form) {
  const chords = progression(song.key, song.scale, form.sequence).slice(0, SONG_LIMITS.bars[1]);
  if (part?.kind !== 'synth') return { part, problem: 'Notes are written for synth parts' };
  if (!chords.length) return { part, problem: 'No chord could be read — try Am F C G' };
  const beats = song.beatsPerBar;
  const seed = Math.round(form.seed) || 1;
  const option = writerOption(form);
  /** @type {Note[]} */
  let notes;
  if (form.what === 'pad') notes = padNotes(chords, { beats });
  else if (form.what === 'arp') notes = arpeggio(chords, { beats, mode: option, rate: 2, seed });
  else if (form.what === 'melody') {
    notes = melody(chords, { key: song.key, scale: song.scale, beats, seed });
  } else notes = bassLine(chords, { style: option, beats, seed });
  return { part: { ...part, bars: chords.length, notes }, problem: '' };
}
