/**
 * A song from a MIDI file: its tempo and bars, channel 10 as drum lanes on
 * the nearest step of the nearest drum, every other channel as a synth part
 * with the preset that stands for its instrument family. What a song cannot
 * hold — tempo changes, percussion without a drum, effects programs — is
 * left out and said. Isomorphic and pure.
 * @module utils/music/midi/import
 */

import { SONG_LIMITS as LIMITS, STEP_COUNTS } from '#utils/music/limits.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { importDrums, importSynth } from './importParts.js';
import { DRUM_CHANNEL } from './gm.js';
import { parseMidi } from './parse.js';

/** @typedef {import('./parse.js').Midi} Midi */
/** @typedef {import('#utils/music/types.js').Song} Song */

/**
 * @param {Midi} midi
 * @param {string[]} warnings - Added to
 * @returns {number} The tempo of the song
 */
function tempoOf(midi, warnings) {
  const bpm = midi.tempos.length ? midi.tempos[0].bpm : 120;
  if (midi.tempos.some((tempo) => Math.abs(tempo.bpm - bpm) > 0.01)) {
    warnings.push(`The tempo changes in the file; a song has one: ${Math.round(bpm)} is used`);
  }
  const [slow, fast] = LIMITS.bpm;
  if (bpm < slow || bpm > fast)
    warnings.push(`A tempo of ${Math.round(bpm)} is outside ${slow}..${fast}`);
  return Math.round(Math.min(fast, Math.max(slow, bpm)) * 100) / 100;
}

/**
 * @param {Midi} midi
 * @param {string[]} warnings
 * @returns {number} Quarter-note beats in a bar
 */
function barOf(midi, warnings) {
  const first = midi.signatures[0] || { numerator: 4, denominator: 4 };
  const beats = (first.numerator * 4) / first.denominator;
  const [least, most] = LIMITS.beatsPerBar;
  const whole = Math.min(most, Math.max(least, Math.round(beats) || 4));
  if (whole !== beats) {
    warnings.push(
      `${first.numerator}/${first.denominator} is not a whole number of beats: ${whole} are used`,
    );
  }
  const changed = midi.signatures.some(
    (other) => other.numerator !== first.numerator || other.denominator !== first.denominator,
  );
  if (changed) warnings.push('The time signature changes in the file; a song has one');
  return whole;
}

/**
 * Turn a MIDI file into a song.
 * @param {Midi|Uint8Array|ArrayBuffer|number[]} midi - A parsed file, or its bytes
 * @param {{ kit?: string, steps?: number }} [opts] - `kit` of the drum parts
 *   (default `acoustic`); `steps` per bar of their grid (default: the
 *   coarsest grid the hits fit)
 * @returns {{ song: Song, warnings: string[] }} `warnings` says what could
 *   not be carried over. Without a readable file: an empty song and one warning
 */
export function songFromMidi(midi, opts = {}) {
  const file =
    midi && Array.isArray(/** @type {any} */ (midi).notes)
      ? /** @type {Midi} */ (midi)
      : parseMidi(/** @type {any} */ (midi));
  if (!file) return { song: normalizeSong({}), warnings: ['This is not a MIDI file'] };
  const warnings = [...file.warnings];
  const bpm = tempoOf(file, warnings);
  const beatsPerBar = barOf(file, warnings);
  const ticks = Math.max(1, file.division);
  const last = file.notes.reduce((end, note) => Math.max(end, note.tick + note.ticks), 0) / ticks;
  const bars = Math.max(1, Math.ceil(last / beatsPerBar - 1e-6));
  /** @type {Map<string, import('./parse.js').MidiNote[]>} */
  const groups = new Map();
  for (const note of file.notes) {
    const key = `${note.track}:${note.channel}`;
    const group = groups.get(key);
    if (group) group.push(note);
    else groups.set(key, [note]);
  }
  const frame = { beatsPerBar, bars: Math.min(bars, LIMITS.bars[1]), ticks };
  const steps = STEP_COUNTS.includes(opts.steps) ? opts.steps : 0;
  const ordered = [...groups.values()].sort(
    (a, b) => a[0].track - b[0].track || a[0].channel - b[0].channel,
  );
  let parts = ordered.map((notes) => {
    const name = file.tracks[notes[0].track]?.name || '';
    return notes[0].channel === DRUM_CHANNEL
      ? importDrums(notes, { ...frame, name, kit: opts.kit ?? 'acoustic', steps }, warnings)
      : importSynth(notes, { ...frame, name }, warnings);
  });
  parts = parts.filter(Boolean);
  if (parts.length > LIMITS.parts) {
    warnings.push(
      `The file has ${parts.length} parts; the ${LIMITS.parts} with the most notes are kept`,
    );
    const size = (part) =>
      part.notes ? part.notes.length : Object.values(part.lanes).join('').length;
    const kept = new Set([...parts].sort((a, b) => size(b) - size(a)).slice(0, LIMITS.parts));
    parts = parts.filter((part) => kept.has(part));
  }
  const song = normalizeSong({ bpm, beatsPerBar, bars: frame.bars, parts });
  if (song.bars < bars)
    warnings.push(`The file is ${bars} bars long; the first ${song.bars} are kept`);
  return { song, warnings };
}
