/**
 * The synth's parameters, as data: one design plays every preset, and this
 * table says what can be turned on it. The editor builds its controls from
 * it, the director is told its vocabulary from it, and normalisation bounds
 * a part's `params` by it — nothing about a parameter is written anywhere
 * else. The shape is a compositor parameter schema
 * (`#utils/compose/params.js`). Isomorphic and pure.
 * @module utils/music/catalog/synthParams
 */

/** @typedef {import('#utils/compose/params.js').ParamSpec} ParamSpec */

/** Shapes an oscillator can have. */
export const WAVES = Object.freeze(['sine', 'triangle', 'saw', 'pulse', 'noise']);
/** What the filter lets through; `lowpass24` is twice as steep. */
export const FILTER_TYPES = Object.freeze(['lowpass', 'lowpass24', 'bandpass', 'highpass']);
/** Shapes of the LFO. */
export const LFO_WAVES = Object.freeze(['sine', 'triangle', 'square', 'saw']);

/**
 * @param {string} group
 * @param {string} label
 * @param {number} value - Default
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {string} [unit]
 * @returns {ParamSpec}
 */
function number(group, label, value, min, max, step, unit) {
  return Object.freeze({ type: 'number', default: value, min, max, step, unit, label, group });
}

/**
 * @param {string} group
 * @param {string} label
 * @param {readonly string[]} options
 * @param {string} value - Default
 * @returns {ParamSpec}
 */
function choice(group, label, options, value) {
  return Object.freeze({ type: 'select', default: value, options: [...options], label, group });
}

/** Seconds of an envelope stage: 1 ms … 10 s. */
const time = (group, label, value) => number(group, label, value, 0.001, 10, 0.001, 's');
const share = (group, label, value) => number(group, label, value, 0, 1, 0.01);

const OSC1 = 'Oscillator 1';
const OSC2 = 'Oscillator 2';
const UNISON = 'Unison';
const FILTER = 'Filter';
const FILTER_ENV = 'Filter envelope';
const AMP = 'Amplifier';
const LFO = 'LFO';
const VOICE = 'Voice';

/**
 * Every parameter of the synth. Times are seconds to rise fully or to fall
 * 60 dB; pitches are semitones (`st`), cents (`ct`) or octaves (`oct`).
 * @type {Readonly<Record<string, ParamSpec>>}
 */
export const SYNTH_PARAMS = Object.freeze({
  osc1Wave: choice(OSC1, 'Wave', WAVES, 'saw'),
  osc1Level: share(OSC1, 'Level', 0.8),
  osc1Octave: number(OSC1, 'Octave', 0, -3, 3, 1, 'oct'),
  osc1Width: number(OSC1, 'Pulse width', 0.5, 0.05, 0.95, 0.01),
  subLevel: share(OSC1, 'Sub (a sine one octave down)', 0),
  osc2Wave: choice(OSC2, 'Wave', WAVES, 'saw'),
  osc2Level: share(OSC2, 'Level', 0),
  osc2Pitch: number(OSC2, 'Pitch', 0, -36, 36, 0.01, 'st'),
  osc2Detune: number(OSC2, 'Fine tune', 0, -100, 100, 1, 'ct'),
  osc2Width: number(OSC2, 'Pulse width', 0.5, 0.05, 0.95, 0.01),
  fm: share(OSC2, 'FM: bends a sine oscillator 1, with the filter envelope', 0),
  unison: number(UNISON, 'Voices per note', 1, 1, 7, 1),
  detune: number(UNISON, 'Detune', 12, 0, 100, 1, 'ct'),
  spread: share(UNISON, 'Stereo spread', 0.5),
  filterType: choice(FILTER, 'Type', FILTER_TYPES, 'lowpass'),
  cutoff: number(FILTER, 'Cutoff', 2000, 20, 20000, 1, 'Hz'),
  resonance: share(FILTER, 'Resonance', 0.1),
  keyTrack: share(FILTER, 'Key tracking', 0.3),
  filterEnv: number(FILTER_ENV, 'Amount', 0, -8, 8, 0.1, 'oct'),
  filterAttack: time(FILTER_ENV, 'Attack', 0.005),
  filterDecay: time(FILTER_ENV, 'Decay', 0.3),
  filterSustain: share(FILTER_ENV, 'Sustain', 0.3),
  filterRelease: time(FILTER_ENV, 'Release', 0.3),
  attack: time(AMP, 'Attack', 0.005),
  decay: time(AMP, 'Decay', 0.3),
  sustain: share(AMP, 'Sustain', 0.7),
  release: time(AMP, 'Release', 0.2),
  velocity: share(AMP, 'Velocity sensitivity', 0.6),
  drive: share(AMP, 'Drive', 0),
  level: number(AMP, 'Level', 0, -24, 12, 0.5, 'dB'),
  lfoWave: choice(LFO, 'Wave', LFO_WAVES, 'sine'),
  lfoRate: number(LFO, 'Rate', 5, 0.05, 20, 0.01, 'Hz'),
  lfoFade: number(LFO, 'Fade in', 0, 0, 5, 0.01, 's'),
  lfoPitch: number(LFO, 'To pitch (vibrato)', 0, 0, 12, 0.01, 'st'),
  lfoFilter: number(LFO, 'To cutoff', 0, 0, 4, 0.01, 'oct'),
  lfoAmp: share(LFO, 'To level (tremolo)', 0),
  lfoWidth: number(LFO, 'To pulse width', 0, 0, 0.45, 0.01),
  voices: number(VOICE, 'Polyphony (1 = mono, legato)', 8, 1, 16, 1),
  glide: number(VOICE, 'Glide', 0, 0, 2, 0.001, 's'),
});

/** Parameters that only take whole numbers. */
export const WHOLE_PARAMS = Object.freeze(['osc1Octave', 'unison', 'voices']);
