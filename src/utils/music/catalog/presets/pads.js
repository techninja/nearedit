/**
 * Presets that are held: wide, slow, made for chords.
 * @module utils/music/catalog/presets/pads
 */

import { preset } from './preset.js';

export const pad = preset(
  'pad',
  'Pad',
  'pad',
  'A wide, slow wash of four detuned saws for chords',
  {
    osc1Level: 0.9,
    unison: 4,
    detune: 17,
    spread: 0.9,
    cutoff: 700,
    resonance: 0.12,
    keyTrack: 0.4,
    filterEnv: 1.6,
    filterAttack: 0.9,
    filterDecay: 1.5,
    filterSustain: 0.6,
    filterRelease: 1.4,
    attack: 0.5,
    decay: 1,
    sustain: 0.85,
    release: 1.5,
    velocity: 0.3,
    lfoRate: 0.23,
    lfoFilter: 0.35,
    level: -7.5,
  },
);

export const strings = preset(
  'strings',
  'Strings',
  'pad',
  'A string-machine ensemble: saw and a moving pulse, gentle vibrato',
  {
    osc2Wave: 'pulse',
    osc2Level: 0.6,
    osc2Width: 0.5,
    osc2Pitch: 12,
    unison: 2,
    detune: 11,
    spread: 0.8,
    cutoff: 2600,
    resonance: 0.05,
    keyTrack: 0.3,
    filterEnv: 0.6,
    filterAttack: 0.3,
    filterDecay: 0.8,
    filterSustain: 0.7,
    filterRelease: 0.6,
    attack: 0.22,
    decay: 0.5,
    sustain: 0.9,
    release: 0.6,
    velocity: 0.4,
    lfoRate: 5.3,
    lfoFade: 0.5,
    lfoPitch: 0.09,
    lfoWidth: 0.25,
    level: -10.5,
  },
);
