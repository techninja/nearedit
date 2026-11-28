/**
 * The songs the parity test renders in both runtimes: between them every
 * preset, every kit, both effects, swing, odd bars and voice stealing.
 * @module tests/music/songs
 */

import {
  arpeggio,
  bassLine,
  drumPart,
  melody,
  padNotes,
  progression,
} from '../../src/utils/music/index.js';

const CHORDS = progression('D', 'minor', 'i-VI-III-VII');

/**
 * @param {string} preset
 * @param {number[][]} notes
 * @param {Record<string, any>} [mix]
 * @returns {Record<string, any>} A synth part of four bars
 */
const synth = (preset, notes, mix = {}) => ({ kind: 'synth', preset, bars: 4, notes, ...mix });

/**
 * One song per preset family, each with another kit, effects on.
 * @type {Record<string, any>}
 */
export const SONGS = {
  'bass presets, 808': {
    bpm: 128,
    bars: 4,
    tail: 1.5,
    master: { reverb: { size: 0.3, decay: 0.3 }, delay: { beats: 0.5, feedback: 0.4 } },
    parts: [
      { ...drumPart('fourOnTheFloor', { kit: '808' }), reverb: 0.2 },
      synth('bass', bassLine(CHORDS, { style: 'syncopated', seed: 3 }), { delay: 0.2 }),
      synth('sub', bassLine(CHORDS, { octave: 1 }), { pan: -0.2 }),
      synth('acid', bassLine(CHORDS, { style: 'octaves' }), { reverb: 0.3, delay: 0.3, pan: 0.4 }),
    ],
  },
  'keys presets, 909, swung': {
    bpm: 96,
    bars: 4,
    swing: 0.35,
    tail: 2,
    parts: [
      { ...drumPart('boomBap', { kit: '909', bars: 4, fillEvery: 4 }), delay: 0.15 },
      synth('pluck', arpeggio(CHORDS, { rate: 4, mode: 'updown', octaves: 2 }), {
        delay: 0.4,
        pan: 0.5,
      }),
      synth('keys', padNotes(CHORDS, { gap: 1 }), { reverb: 0.4 }),
      synth('organ', padNotes(CHORDS, { center: 72, beats: 2 }), { reverb: 0.2, pan: -0.5 }),
      synth('bell', melody(CHORDS, { key: 'D', scale: 'minor', seed: 4, octave: 6 }), {
        reverb: 0.6,
      }),
    ],
  },
  'pad presets, acoustic, in seven': {
    bpm: 150,
    beatsPerBar: 7,
    bars: 2,
    tail: 2.5,
    master: { volume: 1, reverb: { size: 0.9, decay: 0.8 } },
    parts: [
      { ...drumPart('breakbeat', { kit: 'acoustic' }), steps: 24, reverb: 0.3 },
      synth('pad', padNotes(CHORDS, { beats: 3.5 }), { reverb: 0.7, bars: 2 }),
      synth('strings', padNotes(CHORDS, { beats: 3.5, center: 74 }), {
        reverb: 0.5,
        delay: 0.2,
        bars: 2,
      }),
    ],
  },
  'lead presets, lo-fi, stolen voices': {
    bpm: 84,
    bars: 2,
    tail: 1,
    parts: [
      { ...drumPart('halfTime', { kit: 'lofi', bars: 2, fillEvery: 2 }), reverb: 0.25 },
      synth('lead', melody(CHORDS.slice(0, 2), { key: 'D', scale: 'minor', seed: 9 }), {
        delay: 0.35,
        bars: 2,
      }),
      synth('arp', arpeggio(CHORDS.slice(0, 2), { rate: 4, mode: 'random', seed: 5, gate: 3 }), {
        ...{ bars: 2, reverb: 0.3, transpose: 12 },
        params: { voices: 2, release: 0.8 },
      }),
    ],
  },
};
