/**
 * A synth part's parameters as the numbers its voices work with: levels,
 * pitch ratios, envelope rates per control tick, filter weights. Made once
 * per part when a renderer is created. Isomorphic and pure.
 * @module utils/music/engine/synthPatch
 */

import { partParams } from '#utils/music/params.js';
import { damping, filterMix } from './filter.js';
import { dbGain, decayPerSample, exp, pow2, sinTurn } from './math.js';

/** Samples between two updates of a voice's envelopes, LFO, pitch and filter. */
export const TICK = 32;
/** Loudness of one voice at full level, before the part's volume. */
const VOICE_GAIN = 0.32;
/** Turns of phase a full `fm` bends the carrier by. */
const FM_TURNS = 1.2;

/** @typedef {ReturnType<typeof compilePatch>} SynthPatch */

/**
 * @param {number} seconds
 * @param {number} sampleRate
 * @returns {number} What an envelope keeps of its distance to go, per tick
 */
function perTick(seconds, sampleRate) {
  const coef = decayPerSample(seconds, sampleRate);
  let kept = 1;
  for (let i = 0; i < TICK; i++) kept *= coef;
  return kept;
}

/**
 * @param {any} part - A normalised synth part
 * @param {number} sampleRate
 * @returns {Object} The patch
 */
export function compilePatch(part, sampleRate) {
  const p = partParams(part);
  const unison = p.unison;
  const stereo = unison > 1 && p.spread > 0;
  const onA = stereo ? Math.ceil(unison / 2) : unison;
  const onB = unison - onA;
  // Spread 1 keeps the two halves of the unison apart, 0 folds them together.
  const angle = ((1 - p.spread) * 0.125) % 1;
  const mixA = stereo ? sinTurn(0.25 - angle) : 1;
  const mixB = stereo ? sinTurn(angle) : 0;
  const layers = Array.from({ length: unison }, (_, u) => {
    const cents = unison > 1 ? p.detune * ((2 * u) / (unison - 1) - 1) : 0;
    const second = stereo && u % 2 === 1;
    return { ratio: pow2(cents / 1200), second, gain: 1 / Math.sqrt(second ? onB : onA) };
  });
  const [low, band, high] = filterMix(p.filterType);
  const k = damping(p.resonance);
  const pre = p.drive > 0 ? 1 + 5 * p.drive : 0;
  const fm = p.osc1Wave === 'sine' && p.fm > 0 ? p.fm * FM_TURNS : 0;
  return {
    wave1: p.osc1Wave,
    wave2: p.osc2Wave,
    level1: p.osc1Level,
    level2: p.osc2Level,
    width1: p.osc1Width,
    width2: p.osc2Width,
    ratio1: pow2(p.osc1Octave),
    ratio2: pow2(p.osc1Octave + (p.osc2Pitch + p.osc2Detune / 100) / 12),
    fm,
    sub: p.subLevel / (mixA + mixB),
    layers,
    stereo,
    mixA,
    mixB,
    mix: [low, band * k, high],
    steep: p.filterType === 'lowpass24',
    k,
    cutoff: p.cutoff,
    keyTrack: p.keyTrack,
    envOctaves: p.filterEnv,
    filterEnv: envelope(
      p.filterAttack,
      p.filterDecay,
      p.filterSustain,
      p.filterRelease,
      sampleRate,
    ),
    ampEnv: envelope(p.attack, p.decay, p.sustain, p.release, sampleRate),
    velocity: p.velocity,
    pre,
    post: pre ? (1 + 2 * p.drive) / pre : 1,
    gain: dbGain(p.level) * VOICE_GAIN,
    lfoUsed: p.lfoPitch > 0 || p.lfoFilter > 0 || p.lfoAmp > 0 || p.lfoWidth > 0,
    lfoWave: p.lfoWave,
    lfoInc: p.lfoRate / sampleRate,
    lfoFade: p.lfoFade * sampleRate,
    lfoPitch: p.lfoPitch,
    lfoFilter: p.lfoFilter,
    lfoAmp: p.lfoAmp,
    lfoWidth: p.lfoWidth,
    voices: p.voices,
    glide: p.glide > 0 ? 1 - exp((-4 * TICK) / (p.glide * sampleRate)) : 1,
    transpose: part.transpose || 0,
    sampleRate,
  };
}

/**
 * @param {number} attack - Seconds to rise from nothing to full
 * @param {number} decay - Seconds to fall 60 dB of the way to the sustain
 * @param {number} sustain - 0 … 1
 * @param {number} release - Seconds to fall 60 dB
 * @param {number} sampleRate
 * @returns {{ attack: number, decay: number, sustain: number, release: number }}
 *   The rise per tick and what is kept per tick of the distance to go
 */
function envelope(attack, decay, sustain, release, sampleRate) {
  return {
    attack: TICK / Math.max(TICK, attack * sampleRate),
    decay: perTick(decay, sampleRate),
    sustain,
    release: perTick(release, sampleRate),
  };
}
