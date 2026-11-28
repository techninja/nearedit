/**
 * The oscillators of a voice: two for every unison layer, and the sub. Each
 * layer goes to one of the voice's two buses, which become its two sides.
 * Isomorphic and pure apart from the voice it is given.
 * @module utils/music/engine/voiceOscillators
 */

import { pulse, saw, triangle } from './oscillators.js';
import { noise, sine } from './plainWaves.js';

/** @typedef {import('./voice.js').Voice} Voice */

/** Slots of a voice's phase array: where each oscillator's layers begin, and the sub. */
export const OSC1 = 0;
export const OSC2 = 7;
export const SUB = 14;
/** No oscillator runs faster than this share of the sample rate. */
const TOP = 0.24;

/**
 * Add one oscillator to a buffer.
 * @param {Voice} voice
 * @param {string} wave
 * @param {Float64Array} out
 * @param {number} count
 * @param {number} slot - Its phase
 * @param {number} inc
 * @param {number} gain
 * @param {number} width
 */
function oscillate(voice, wave, out, count, slot, inc, gain, width) {
  if (wave === 'saw') saw(out, count, voice.phase, slot, inc, gain);
  else if (wave === 'pulse') pulse(out, count, voice.phase, slot, inc, gain, width);
  else if (wave === 'triangle') triangle(out, count, voice.phase, slot, inc, gain);
  else if (wave === 'noise') noise(out, count, voice.seeds, slot < OSC2 ? 0 : 1, gain);
  else sine(out, count, voice.phase, slot, inc, gain);
}

/**
 * Add the sub — a sine an octave under oscillator 1, in the middle.
 * @param {Voice} voice
 * @param {number} count
 */
function sub(voice, count) {
  const { patch: p, a, b, mod } = voice;
  const half = Math.min(TOP, voice.inc * p.ratio1 * 0.5);
  if (!p.stereo) return sine(a, count, voice.phase, SUB, half, p.sub);
  for (let i = 0; i < count; i++) mod[i] = 0;
  sine(mod, count, voice.phase, SUB, half, p.sub);
  for (let i = 0; i < count; i++) {
    a[i] += mod[i];
    b[i] += mod[i];
  }
}

/**
 * Add a voice's oscillators to its two buses.
 * @param {Voice} voice
 * @param {number} count - Samples, at most one tick
 */
export function fillBuses(voice, count) {
  const { patch: p, a, b, mod } = voice;
  for (let u = 0; u < p.layers.length; u++) {
    const layer = p.layers[u];
    const bus = layer.second ? b : a;
    const inc1 = Math.min(TOP, voice.inc * p.ratio1 * layer.ratio);
    const inc2 = Math.min(TOP, voice.inc * p.ratio2 * layer.ratio);
    if (p.fm) {
      // Oscillator 2 is made first: it bends the phase of oscillator 1.
      for (let i = 0; i < count; i++) mod[i] = 0;
      oscillate(voice, p.wave2, mod, count, OSC2 + u, inc2, 1, voice.width2);
      const gain2 = p.level2 * layer.gain;
      for (let i = 0; i < count && gain2 > 0; i++) bus[i] += mod[i] * gain2;
      sine(bus, count, voice.phase, OSC1 + u, inc1, p.level1 * layer.gain, mod, voice.fm);
      continue;
    }
    const gain1 = p.level1 * layer.gain;
    const gain2 = p.level2 * layer.gain;
    if (gain1 > 0) oscillate(voice, p.wave1, bus, count, OSC1 + u, inc1, gain1, voice.width1);
    if (gain2 > 0) oscillate(voice, p.wave2, bus, count, OSC2 + u, inc2, gain2, voice.width2);
  }
  if (p.sub > 0) sub(voice, count);
}
