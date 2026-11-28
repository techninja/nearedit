/**
 * Presets for a single line on top: a singing lead and a sequencer blip.
 * @module utils/music/catalog/presets/leads
 */

import { preset } from './preset.js';

export const lead = preset(
  'lead',
  'Lead',
  'lead',
  'A singing mono lead that glides between notes, vibrato on long ones',
  {
    osc2Wave: 'pulse',
    osc2Level: 0.55,
    osc2Width: 0.3,
    osc2Detune: 8,
    unison: 2,
    detune: 9,
    spread: 0.4,
    filterType: 'lowpass24',
    cutoff: 1500,
    resonance: 0.3,
    keyTrack: 0.6,
    filterEnv: 1.8,
    filterAttack: 0.004,
    filterDecay: 0.4,
    filterSustain: 0.5,
    attack: 0.006,
    decay: 0.3,
    sustain: 0.8,
    release: 0.18,
    drive: 0.3,
    lfoRate: 5.6,
    lfoFade: 0.35,
    lfoPitch: 0.18,
    voices: 1,
    glide: 0.05,
    level: -2,
  },
);

export const arp = preset(
  'arp',
  'Arp',
  'lead',
  'A tight, hollow blip made for fast arpeggios and sequences',
  {
    osc1Wave: 'pulse',
    osc1Width: 0.28,
    osc2Level: 0.45,
    osc2Pitch: 12,
    osc2Detune: 6,
    cutoff: 900,
    resonance: 0.35,
    keyTrack: 0.5,
    filterEnv: 3.2,
    filterAttack: 0.001,
    filterDecay: 0.12,
    filterSustain: 0.1,
    filterRelease: 0.1,
    attack: 0.002,
    decay: 0.16,
    sustain: 0.2,
    release: 0.12,
    velocity: 0.5,
  },
);
