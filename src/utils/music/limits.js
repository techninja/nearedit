/**
 * The bounds of a song and its defaults. Isomorphic and pure.
 * @module utils/music/limits
 */

/** @typedef {import('./types.js').Song} Song */

/**
 * Everything a song is bounded by. `[min, max]` pairs are inclusive; times
 * are seconds, lengths characters.
 */
export const SONG_LIMITS = Object.freeze({
  bpm: Object.freeze([40, 240]),
  beatsPerBar: Object.freeze([2, 12]),
  bars: Object.freeze([1, 512]),
  swing: Object.freeze([0, 0.75]),
  tail: Object.freeze([0, 30]),
  /** Longest song, tail included: 20 minutes. */
  seconds: 1200,
  parts: 16,
  /** Notes of one synth part. */
  notes: 4000,
  /** Bar ranges of one part's `play`. */
  ranges: 64,
  name: 80,
  id: 40,
  volume: Object.freeze([0, 1.5]),
  pan: Object.freeze([-1, 1]),
  send: Object.freeze([0, 1]),
  transpose: Object.freeze([-48, 48]),
  pitch: Object.freeze([0, 127]),
  /** Length of a note, beats. */
  length: Object.freeze([0.01, 256]),
  delayBeats: Object.freeze([0.0625, 4]),
  feedback: Object.freeze([0, 0.9]),
});

/** Steps a bar of a drum part may be divided into. */
export const STEP_COUNTS = Object.freeze([8, 12, 16, 24, 32]);

/**
 * What a part can be.
 * @type {ReadonlyArray<'drums'|'synth'>}
 */
export const PART_KINDS = Object.freeze(['drums', 'synth']);

/** Velocity of a note that names none. */
export const DEFAULT_VELOCITY = 0.8;

/**
 * @returns {Song} A complete song with no parts: four empty bars at 120 BPM
 */
export function defaultSong() {
  return {
    bpm: 120,
    beatsPerBar: 4,
    bars: 4,
    swing: 0,
    key: 'C',
    scale: 'minor',
    tail: 2,
    master: {
      volume: 0.8,
      reverb: { size: 0.5, decay: 0.5 },
      delay: { beats: 0.75, feedback: 0.35 },
    },
    parts: [],
  };
}

/**
 * @returns {{ mute: boolean, volume: number, pan: number, reverb: number, delay: number }}
 *   What every part starts with
 */
export function defaultMix() {
  return { mute: false, volume: 0.8, pan: 0, reverb: 0, delay: 0 };
}
