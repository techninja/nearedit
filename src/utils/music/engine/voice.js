/**
 * One note of a synth part: its oscillators (two per unison layer and a
 * sub), filter, drive and amplifier. The voice is rendered in runs of at
 * most one control tick; what changes slowly — envelopes, LFO, pitch,
 * cutoff — is set between runs by `control` (voiceControl.js). The phase
 * array holds one slot per unison layer for each oscillator, then the sub.
 * Isomorphic; no state outside the voice.
 * @module utils/music/engine/voice
 */

import { FLAT, svf } from './filter.js';
import { softClip } from './math.js';
import { TICK } from './synthPatch.js';
import { fillBuses } from './voiceOscillators.js';

/** @typedef {import('./synthPatch.js').SynthPatch} SynthPatch */

export class Voice {
  /** @param {any} patch - A compiled patch (synthPatch.js) */
  constructor(patch) {
    this.patch = patch;
    this.active = false;
    /** True while the key is down. */
    this.gate = false;
    this.started = 0;
    this.offAt = Infinity;
    this.note = 60;
    this.pitch = 60;
    this.level = 0;
    this.phase = new Float64Array(15);
    this.seeds = new Int32Array(2);
    this.filter = new Float64Array(8);
    this.a = new Float64Array(TICK);
    this.b = new Float64Array(TICK);
    this.mod = new Float64Array(TICK);
    // Envelopes: stage 0 rising, 1 falling to the sustain, 2 released.
    this.amp = 0;
    this.ampStage = 0;
    this.env = 0;
    this.envStage = 0;
    this.ending = false;
    // What `control` sets for the run that follows.
    this.gain = 0;
    this.gainStep = 0;
    this.goal = 0;
    this.inc = 0;
    // The filter's coefficient now, what it grows by per sample, where it is going.
    this.g = 0;
    this.gStep = 0;
    this.gGoal = 0;
    // The pitch and the cutoff those two were worked out for.
    this.tuned = -1e9;
    this.opened = -1e9;
    this.fm = 0;
    this.width1 = 0.5;
    this.width2 = 0.5;
  }

  /**
   * Filter and drive one bus in place.
   * @param {Float64Array} bus
   * @param {number} count
   * @param {number} slot - Its filter state
   */
  shape(bus, count, slot) {
    const p = this.patch;
    svf(bus, count, this.filter, slot, this.g, p.k, p.mix[0], p.mix[1], p.mix[2], this.gStep);
    if (p.steep) svf(bus, count, this.filter, slot + 2, this.g, FLAT, 1, 0, 0, this.gStep);
    for (let i = 0; i < count && p.pre; i++) bus[i] = softClip(bus[i] * p.pre) * p.post;
  }

  /**
   * Add the next `count` samples to a stereo pair of buffers.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} offset
   * @param {number} count - At most one tick
   */
  render(left, right, offset, count) {
    const { patch: p, a, b } = this;
    for (let i = 0; i < count; i++) a[i] = b[i] = 0;
    fillBuses(this, count);
    this.shape(a, count, 0);
    if (p.stereo) this.shape(b, count, 4);
    this.g += this.gStep * count;
    let gain = this.gain;
    const step = this.gainStep;
    for (let i = 0; i < count && !p.stereo; i++, gain += step) {
      left[offset + i] += a[i] * gain;
      right[offset + i] += a[i] * gain;
    }
    for (let i = 0; i < count && p.stereo; i++, gain += step) {
      left[offset + i] += (a[i] * p.mixA + b[i] * p.mixB) * gain;
      right[offset + i] += (a[i] * p.mixB + b[i] * p.mixA) * gain;
    }
    this.gain = gain;
  }
}
