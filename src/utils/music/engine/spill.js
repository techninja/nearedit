/**
 * Cutting a sound short without a click. When a voice has to stop at once —
 * its note is stolen for a new one, a drum is hit again — the few
 * milliseconds it would still have played are rendered ahead, faded to
 * nothing, and kept here to be mixed in as the song reaches them. The voice
 * itself is free immediately, so the new note starts on its exact sample.
 * Isomorphic; no state outside the instance.
 * @module utils/music/engine/spill
 */

/** Samples of a fade-out: 5 ms at 48 kHz. */
export const SPILL = 256;
/**
 * Samples kept: a power of two with room for a fade-out and for the block
 * that is being mixed while it is taken.
 */
const RING = 1024;

export class Spill {
  constructor() {
    this.left = new Float64Array(RING);
    this.right = new Float64Array(RING);
    this.scratchLeft = new Float64Array(SPILL);
    this.scratchRight = new Float64Array(SPILL);
    /** Samples of the song between which something is kept. */
    this.since = 0;
    this.until = 0;
  }

  /**
   * Take over the end of a sound.
   * @param {number} now - Sample of the song the sound is cut at
   * @param {(left: Float64Array, right: Float64Array) => number} play -
   *   Renders up to `SPILL` samples of what the sound would have played
   *   from `now` into the (cleared) buffers; returns how many
   */
  take(now, play) {
    const { scratchLeft, scratchRight } = this;
    scratchLeft.fill(0);
    scratchRight.fill(0);
    const count = play(scratchLeft, scratchRight);
    for (let i = 0; i < count; i++) {
      const fade = 1 - (i + 1) / SPILL;
      const slot = (now + i) & (RING - 1);
      this.left[slot] += scratchLeft[i] * fade;
      this.right[slot] += scratchRight[i] * fade;
    }
    if (this.until <= this.since) this.since = now;
    if (now + count > this.until) this.until = now + count;
  }

  /**
   * Mix what is kept for `count` samples from `pos` into a pair of buffers.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} pos - Sample of the song the buffers start at
   * @param {number} count
   * @returns {boolean} True when anything was mixed in
   */
  mix(left, right, pos, count) {
    const start = Math.max(pos, this.since);
    const end = Math.min(pos + count, this.until);
    for (let at = start; at < end; at++) {
      const slot = at & (RING - 1);
      left[at - pos] += this.left[slot];
      right[at - pos] += this.right[slot];
      this.left[slot] = 0;
      this.right[slot] = 0;
    }
    if (end > start) this.since = end;
    return end > start;
  }
}
