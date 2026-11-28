/**
 * Bass presets: one voice each, so notes that overlap slide into each other.
 * @module utils/music/catalog/presets/bass
 */

import { preset } from './preset.js';

export const bass = preset(
  'bass',
  'Bass',
  'bass',
  'A round, punchy synth bass: saw and pulse through a closing filter',
  {
    osc2Wave: 'pulse',
    osc2Level: 0.5,
    osc2Width: 0.4,
    osc2Detune: 7,
    subLevel: 0.5,
    filterType: 'lowpass24',
    cutoff: 180,
    resonance: 0.2,
    keyTrack: 0.5,
    filterEnv: 3.4,
    filterAttack: 0.002,
    filterDecay: 0.22,
    filterSustain: 0.2,
    filterRelease: 0.15,
    attack: 0.003,
    decay: 0.3,
    sustain: 0.8,
    release: 0.09,
    velocity: 0.5,
    drive: 0.25,
    voices: 1,
    level: 1,
  },
);

export const sub = preset(
  'sub',
  'Sub bass',
  'bass',
  'A deep sine with a little warmth, felt more than heard',
  {
    osc1Wave: 'sine',
    osc1Level: 1,
    osc2Wave: 'triangle',
    osc2Level: 0.15,
    osc2Pitch: 12,
    cutoff: 900,
    resonance: 0,
    keyTrack: 0,
    attack: 0.008,
    decay: 0.2,
    sustain: 0.9,
    release: 0.12,
    velocity: 0.3,
    drive: 0.2,
    voices: 1,
    level: -1.5,
  },
);

export const acid = preset(
  'acid',
  'Acid',
  'bass',
  'A squelching, sliding saw line: high resonance, fast filter envelope',
  {
    osc1Level: 0.9,
    filterType: 'lowpass24',
    cutoff: 260,
    resonance: 0.8,
    keyTrack: 0.3,
    filterEnv: 4.2,
    filterAttack: 0.002,
    filterDecay: 0.24,
    filterSustain: 0.05,
    filterRelease: 0.1,
    attack: 0.002,
    decay: 0.3,
    sustain: 0.65,
    release: 0.06,
    velocity: 0.8,
    drive: 0.5,
    voices: 1,
    glide: 0.07,
    level: 2,
  },
);
