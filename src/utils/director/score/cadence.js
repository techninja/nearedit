/**
 * The cadence of a score: two bars that every section change and the
 * ending are made of. The first is the turnaround — the chord that leads
 * home, with the bass pushing towards it — and plays alone in the bar
 * before every new section; the second is the tonic chord, struck once and
 * left to ring, and only the last two bars of the song reach it.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/cadence
 */

import { note } from '#utils/music/theory/random.js';
import { voiceLead } from '#utils/music/theory/voicing.js';
import { partId, tone } from './parts.js';
import { ROLE_RANGE, foldInto } from './tidy.js';

/** @typedef {import('./style.js').StylePart} StylePart */
/** @typedef {import('./harmony.js').Harmony} Harmony */

/** How much of the last bar the final chord is held; the rest is its ring. */
const HOLD = 0.6;

/**
 * @param {StylePart} spec - The instrument that plays it
 * @param {number[][]} notes
 * @param {{ bars: number, brightness?: number }} opts
 * @returns {Record<string, any>} A part without `play` ranges
 */
function cadencePart(spec, notes, { bars, brightness = 0.5 }) {
  const name = `${spec.name} cadence`;
  return {
    id: partId(name),
    name,
    kind: 'synth',
    preset: spec.preset,
    params: tone(spec.preset, spec.params, brightness),
    volume: spec.volume,
    pan: spec.pan,
    reverb: spec.reverb,
    delay: 0,
    bars,
    notes,
  };
}

/**
 * The chords of the cadence, on the style's first chord instrument.
 * @param {StylePart} spec
 * @param {Harmony} harmony
 * @param {{ beats: number, short?: boolean, brightness?: number }} opts - `short`:
 *   a song of one bar has only the final chord
 * @returns {Record<string, any>}
 */
export function cadenceChords(spec, harmony, { beats, short = false, brightness }) {
  const [turn, home] = voiceLead([harmony.turn, harmony.tonic], { center: spec.write.center });
  const at = short ? 0 : beats;
  const notes = [
    ...(short ? [] : turn.map((pitch) => note(0, beats - 0.1, pitch, 0.6))),
    ...home.map((pitch) => note(at, beats * HOLD, pitch, 0.8)),
  ];
  const fitted = foldInto(notes, ROLE_RANGE.chords);
  return cadencePart(spec, fitted, { bars: short ? 1 : 2, brightness });
}

/**
 * The bass of the cadence: the turnaround's root held, then pushed in
 * eighths towards the bar line; the key note under the final chord.
 * @param {StylePart} spec
 * @param {Harmony} harmony
 * @param {{ beats: number, short?: boolean, brightness?: number }} opts
 * @returns {Record<string, any>}
 */
export function cadenceBass(spec, harmony, { beats, short = false, brightness }) {
  const octave = Number.isFinite(spec.write.octave) ? spec.write.octave : 2;
  const root = (/** @type {number} */ pitchClass) => (octave + 1) * 12 + pitchClass;
  const half = Math.floor(beats / 2);
  const notes = [];
  if (!short) {
    notes.push(note(0, half * 0.95, root(harmony.turn.bass), 0.85));
    for (let beat = half; beat < beats - 1e-9; beat += 0.5) {
      const push = 0.6 + (0.3 * (beat - half)) / Math.max(0.5, beats - half);
      notes.push(note(beat, 0.45, root(harmony.turn.bass), push));
    }
  }
  notes.push(note(short ? 0 : beats, beats * HOLD, root(harmony.tonic.bass), 0.9));
  const fitted = foldInto(notes, ROLE_RANGE.bass);
  return cadencePart(spec, fitted, { bars: short ? 1 : 2, brightness });
}
