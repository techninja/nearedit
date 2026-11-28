/**
 * The limiter that ends every mix: it looks a few milliseconds ahead, turns
 * the level down smoothly before a peak arrives and lets it come back
 * slowly, so that no sample leaves above the ceiling whatever a song throws
 * at it — and a song that never gets that loud passes untouched (delayed by
 * the look-ahead, which the renderer takes off again). Isomorphic; no state
 * outside the instance.
 * @module utils/music/engine/limiter
 */

import { exp } from './math.js';

/** No sample leaves above this: 1 dB under full scale. */
export const CEILING = 0.891;
const LOOKAHEAD = 0.005;
const RELEASE = 0.12;

export class Limiter {
  /** @param {number} sampleRate */
  constructor(sampleRate) {
    const size = Math.max(2, Math.round(LOOKAHEAD * sampleRate));
    this.size = size;
    /** Samples the output is behind the input. */
    this.latency = size - 1;
    this.heldL = new Float64Array(size);
    this.heldR = new Float64Array(size);
    // The lowest gain asked for in the last `size` samples, as a queue of
    // candidates that only ever get larger; then its average over `size`.
    this.queueGain = new Float64Array(size + 1);
    this.queueAt = new Float64Array(size + 1);
    this.head = 0;
    this.tail = 0;
    this.box = new Float64Array(size).fill(1);
    this.sum = size;
    this.at = 0;
    this.clock = 0;
    this.asked = 1;
    /** True while every gain in memory is 1. */
    this.rest = true;
    this.recover = 1 - exp(-1 / (RELEASE * sampleRate));
  }

  /**
   * @param {number} gain - The gain this sample asks for
   * @returns {number} The lowest gain asked for in the last `size` samples
   */
  lowest(gain) {
    const { queueGain, queueAt, size } = this;
    let tail = this.tail;
    // Candidates that are no lower than the new one can never be the lowest again.
    while (tail !== this.head && queueGain[tail === 0 ? size : tail - 1] >= gain) {
      tail = tail === 0 ? size : tail - 1;
    }
    queueGain[tail] = gain;
    queueAt[tail] = this.clock;
    this.tail = tail === size ? 0 : tail + 1;
    if (queueAt[this.head] <= this.clock - size) this.head = this.head === size ? 0 : this.head + 1;
    return queueGain[this.head];
  }

  /**
   * Limit a stereo pair of buffers in place.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} count
   */
  process(left, right, count) {
    const { heldL, heldR, box, size, recover } = this;
    let loudest = 0;
    for (let i = 0; i < count; i++) {
      const peak = Math.max(left[i] < 0 ? -left[i] : left[i], right[i] < 0 ? -right[i] : right[i]);
      // Anything that is not a number of a sane size is dropped, not passed on.
      if (!(peak < 1e9)) left[i] = right[i] = 0;
      else if (peak > loudest) loudest = peak;
    }
    // At rest and with nothing to do: the block only has to be delayed.
    const resting = this.rest && loudest <= CEILING;
    for (let i = 0; i < count; i++) {
      // The sample that went in `size − 1` samples ago is the one in the slot after.
      const slot = this.at + 1 === size ? 0 : this.at + 1;
      const l = left[i];
      const r = right[i];
      let gain = 1;
      if (!resting) {
        const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        const want = peak > CEILING ? CEILING / peak : 1;
        const back = this.asked + (1 - this.asked) * recover;
        this.asked = want < back ? want : back > 0.999999 ? 1 : back;
        const low = this.lowest(this.asked);
        this.sum += low - box[this.at];
        box[this.at] = low;
        gain = this.sum / size;
      }
      heldL[this.at] = l;
      heldR[this.at] = r;
      const outL = heldL[slot] * gain;
      const outR = heldR[slot] * gain;
      left[i] = outL > CEILING ? CEILING : outL < -CEILING ? -CEILING : outL;
      right[i] = outR > CEILING ? CEILING : outR < -CEILING ? -CEILING : outR;
      this.at = slot;
      this.clock++;
    }
    if (!resting) this.settle();
  }

  /**
   * See whether the limiter is back at rest: for a whole look-ahead nothing
   * has asked for less than full gain. Then its memory is made exactly
   * that, and blocks pass through until a peak comes.
   */
  settle() {
    const { box, size } = this;
    let rest = this.asked === 1;
    for (let i = 0; i < size && rest; i++) rest = box[i] === 1;
    if (rest) {
      this.sum = size;
      this.head = this.tail = 0;
    }
    this.rest = rest;
  }
}
