/**
 * The small loops among the Create tab's starting points: drums, a bass,
 * chords and a line on top, in different styles. A loop is a row of a
 * table — tempo, key, a chord progression, a beat and what plays each
 * role; its notes are written by the theory helpers, never by hand. Pure:
 * the same row always gives the same song.
 * @module utils/musicUi/starterLoops
 */

import { drumPart } from '#utils/music/theory/beats.js';
import { bassLine } from '#utils/music/theory/bass.js';
import { arpeggio, padNotes } from '#utils/music/theory/chordParts.js';
import { melody } from '#utils/music/theory/melody.js';
import { progression } from '#utils/music/theory/roman.js';

/** The kit each named beat is offered on. */
export const BEAT_KITS = {
  fourOnTheFloor: '909',
  backbeat: 'acoustic',
  boomBap: 'lofi',
  halfTime: '808',
  breakbeat: '909',
  trap: '808',
  bossa: 'acoustic',
};

/**
 * The loops. `feel` is tempo, swing, key and scale; `chords` a progression
 * (one chord to a bar); `beat` the drums under it; `roles` what plays the
 * bass (`preset:style`), the chords, and the line on top (`preset:mode` of
 * an arpeggio, or `preset:melody`).
 */
const RECIPES = {
  house: {
    about: ['House', 'Four on the floor, a syncopated bass, pads and a plucked arpeggio'],
    feel: [124, 0, 'A', 'minor'],
    chords: 'i-VI-III-VII',
    beat: 'fourOnTheFloor',
    roles: ['bass:syncopated', 'pad', 'pluck:updown'],
  },
  lofi: {
    about: ['Lo-fi', 'A lazy swung beat under soft seventh chords'],
    feel: [82, 0.3, 'D', 'dorian'],
    chords: 'Dm7 G7 Cmaj7 Am7',
    beat: 'boomBap',
    roles: ['sub:syncopated', 'keys', 'bell:melody'],
  },
  pop: {
    about: ['Pop', 'A backbeat, octave bass and bright chords'],
    feel: [108, 0, 'C', 'major'],
    chords: 'I-V-vi-IV',
    beat: 'backbeat',
    roles: ['bass:octaves', 'keys', 'arp:up'],
  },
  trap: {
    about: ['Trap', 'Booming sub, rolling hats and a bell line'],
    feel: [140, 0, 'F', 'minor'],
    chords: 'i-VI-iv-v',
    beat: 'trap',
    roles: ['sub:roots', 'pad', 'bell:melody'],
  },
  bossa: {
    about: ['Bossa', 'A soft clave, a walking bass and electric piano'],
    feel: [120, 0, 'D', 'major'],
    chords: 'Imaj7-vi7-ii7-V7',
    beat: 'bossa',
    roles: ['bass:walking', 'keys', 'pluck:up'],
  },
  cinematic: {
    about: ['Cinematic', 'Half-time drums under slow strings'],
    feel: [90, 0, 'E', 'minor'],
    chords: 'i-VI-III-VII',
    beat: 'halfTime',
    roles: ['sub:roots', 'strings', 'lead:melody'],
  },
};

/** @type {{ id: string, label: string, description: string }[]} The loops, for the tiles */
export const LOOPS = Object.entries(RECIPES).map(([id, { about }]) => ({
  id,
  label: about[0],
  description: about[1],
}));

/**
 * Build a loop from its row.
 * @param {string} id - A key of `RECIPES`
 * @returns {any} A song of four bars
 */
export function loopSong(id) {
  const { feel, chords: sequence, beat, roles } = RECIPES[id];
  const [bpm, swing, key, scale] = /** @type {[number, number, string, string]} */ (feel);
  const [low, chordPreset, high] = roles;
  const chords = progression(key, scale, sequence);
  const [bassPreset, style] = low.split(':');
  const [topPreset, mode] = high.split(':');
  const seed = id.length * 7 + bpm;
  const top =
    mode === 'melody'
      ? melody(chords, { key, scale, seed })
      : arpeggio(chords, { mode, rate: 2, octave: 4, seed });
  const synth = (name, preset, notes, mix) => ({
    kind: 'synth',
    name,
    preset,
    bars: 4,
    notes,
    ...mix,
  });
  return {
    ...{ bpm, swing, key, scale, bars: chords.length },
    parts: [
      { ...drumPart(beat, { kit: BEAT_KITS[beat], bars: 4, fillEvery: 4 }), name: 'Drums' },
      synth('Bass', bassPreset, bassLine(chords, { style, seed }), { volume: 0.85 }),
      synth('Chords', chordPreset, padNotes(chords), { volume: 0.65, reverb: 0.35 }),
      synth('Top', topPreset, top, { volume: 0.55, pan: 0.2, reverb: 0.25, delay: 0.25 }),
    ],
  };
}
