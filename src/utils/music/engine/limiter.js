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
    this.recover = 1 - exp(-1 / (RELEASE * sampleRate));
  }

  /**
   * @param {number} gain - The gain this sample asks for
   * @returns {number} The lowest gain asked for in the last `size` samples
   */
  lowest(gain) {
    const { queueGain, queueAt, size } = this;
    const room = size + 1;
    while (this.head !== this.tail && queueGain[(this.tail + size) % room] >= gain) {
      this.tail = (this.tail + size) % room;
    }
    queueGain[this.tail] = gain;
    queueAt[this.tail] = this.clock;
    this.tail = (this.tail + 1) % room;
    if (queueAt[this.head] <= this.clock - size) this.head = (this.head + 1) % room;
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
    for (let i = 0; i < count; i++) {
      let l = left[i];
      let r = right[i];
      const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
      // Anything that is not a number of a sane size is dropped, not passed on.
      if (!(peak < 1e9)) l = r = 0;
      const want = peak > CEILING && peak < 1e9 ? CEILING / peak : 1;
      const back = this.asked + (1 - this.asked) * recover;
      this.asked = want < back ? want : back;
      const low = this.lowest(this.asked);
      this.sum += low - box[this.at];
      box[this.at] = low;
      const gain = this.sum / size;
      // The sample that went in `size − 1` samples ago is the one in the slot after.
      const slot = this.at + 1 === size ? 0 : this.at + 1;
      heldL[this.at] = l;
      heldR[this.at] = r;
      const outL = heldL[slot] * gain;
      const outR = heldR[slot] * gain;
      left[i] = outL > CEILING ? CEILING : outL < -CEILING ? -CEILING : outL;
      right[i] = outR > CEILING ? CEILING : outR < -CEILING ? -CEILING : outR;
      this.at = slot;
      this.clock++;
    }
  }
}
