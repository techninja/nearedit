/**
 * Songs and fingerprints the tests share. Not part of the runtime API —
 * import it from tests.
 * @module utils/music/engine/testSongs
 */

import { sha256 } from '#utils/web/sha256.js';
import {
  arpeggio,
  bassLine,
  drumPart,
  melody,
  padNotes,
  progression,
} from '#utils/music/theory/index.js';
import { seeded } from '#utils/music/theory/random.js';
import { exp, pow2, sinTurn, softClip, tanHalf } from './math.js';

/**
 * A full arrangement of eight parts: drums, bass, pad chords, electric
 * piano chords, a sixteenth-note arpeggio, a lead, strings and bells — about
 * twenty voices sounding at once, the reverb and the delay both busy.
 * @param {number} [bars=8]
 * @returns {Record<string, any>} The song
 */
export function eightParts(bars = 8) {
  const chords = progression('A', 'minor', 'i-VI-III-VII');
  const synth = (preset, notes, mix = {}) => ({ kind: 'synth', preset, bars: 4, notes, ...mix });
  return {
    bpm: 120,
    bars,
    swing: 0.1,
    parts: [
      drumPart('fourOnTheFloor', { kit: '909' }),
      synth('bass', bassLine(chords, { style: 'syncopated', seed: 2 })),
      synth('pad', padNotes(chords), { reverb: 0.4 }),
      synth('keys', padNotes(chords, { beats: 4, center: 72, gap: 2.5 }), { reverb: 0.2 }),
      synth('arp', arpeggio(chords, { rate: 4, octaves: 2, mode: 'updown' }), {
        delay: 0.3,
        pan: 0.3,
      }),
      synth('lead', melody(chords, { key: 'A', scale: 'minor', seed: 5 }), {
        delay: 0.2,
        reverb: 0.2,
      }),
      synth('strings', padNotes(chords, { center: 76 }), { reverb: 0.5, pan: -0.3 }),
      synth('bell', arpeggio(chords, { rate: 0.5, octave: 6, mode: 'random', seed: 3 }), {
        reverb: 0.4,
      }),
    ],
  };
}

/**
 * The engine's own arithmetic and the seeded generator at ten thousand
 * points, as one fingerprint: the same in every runtime, or parity is lost.
 * @returns {string} 64 hex digits
 */
export function arithmeticPrint() {
  const values = new Float64Array(60000);
  const random = seeded(7);
  for (let i = 0; i < 10000; i++) {
    const x = i / 10000;
    values.set([sinTurn(x), exp(x * 40 - 20), pow2(x * 16 - 8)], i * 6);
    values.set([tanHalf(x * 0.49), softClip(x * 8 - 4), random()], i * 6 + 3);
  }
  return sha256(new Uint8Array(values.buffer));
}
