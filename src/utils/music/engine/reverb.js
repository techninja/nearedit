/**
 * The song's reverb: a feedback delay network. Eight delay lines of
 * unrelated lengths feed each other through a matrix that sends every line
 * into all the others (a Hadamard matrix), so echoes multiply until they
 * are a smooth wash; each trip loses a little level — more of the highs —
 * which sets the decay. Two short all-pass filters per side blur what goes
 * in. Isomorphic; no state outside the instance.
 * @module utils/music/engine/reverb
 */

import { exp } from './math.js';
import { diffuse, feed, hadamard, line, primeFrom, tap } from './reverbParts.js';

/** Line lengths in samples at 48 kHz, before the size scales them (0.6 … 2 times): primes. */
const LINES = [1259, 1433, 1627, 1861, 2129, 2423, 2767, 3251];
/** All-pass lengths in front of the lines: two for the left, two for the right. */
const DIFFUSERS = [229, 613, 241, 641];
/** Highs above this die faster, Hz; lows below the other never get in. */
const DAMP = 8000;
const THIN = 140;
/** Level of the reverberation against what was sent. */
const WET = 0.3;
const SILENT = 1e-7;

export class Reverb {
  /**
   * @param {number} size - 0 (a small room) … 1 (a hall)
   * @param {number} decay - 0 (0.3 s to fall 60 dB) … 1 (8 s)
   * @param {number} sampleRate
   * @param {number} block - The most samples one `process` is asked for
   */
  constructor(size, decay, sampleRate, block) {
    const scale = ((0.6 + 1.4 * size) * sampleRate) / 48000;
    const seconds = 0.3 * exp(decay * 3.2834);
    const lengths = LINES.map((length, i) => primeFrom(length * scale + i));
    this.lines = lengths.map(line);
    this.gains = lengths.map((length) => exp((-6.9078 * length) / (seconds * sampleRate)));
    this.pads = DIFFUSERS.map((length) => line(primeFrom((length * sampleRate) / 48000)));
    /** The longest run: no longer than the shortest delay. */
    this.run = Math.min(block, lengths[0], ...this.pads.map((pad) => pad.memory.length));
    this.longest = lengths[7];
    this.damp = exp((-2 * Math.PI * DAMP) / sampleRate);
    this.thin = exp((-2 * Math.PI * THIN) / sampleRate);
    this.lows = new Float64Array(10);
    this.taps = lengths.map(() => new Float64Array(block));
    this.inL = new Float64Array(block);
    this.inR = new Float64Array(block);
    this.scratch = new Float64Array(block);
    this.idle = true;
    this.quiet = 0;
  }

  /**
   * Take the lows off one side of the send and blur it.
   * @param {Float64Array|null} send - null for silence
   * @param {number} from
   * @param {number} count
   * @param {number} side - 0 left, 1 right
   * @returns {Float64Array} What goes into that side's lines
   */
  enter(send, from, count, side) {
    const input = side ? this.inR : this.inL;
    const { thin, lows } = this;
    let low = lows[8 + side];
    for (let i = 0; i < count; i++) {
      const dry = send ? send[from + i] : 0;
      low = dry + (low - dry) * thin;
      input[i] = dry - low;
    }
    lows[8 + side] = low;
    diffuse(this.pads[side * 2], input, this.scratch, count);
    diffuse(this.pads[side * 2 + 1], input, this.scratch, count);
    return input;
  }

  /**
   * Feed the send in and add the reverberation to the output.
   * @param {Float64Array} sendL
   * @param {Float64Array} sendR
   * @param {Float64Array} outL
   * @param {Float64Array} outR
   * @param {number} count
   * @param {boolean} fed - False when the send is known to be silent
   */
  process(sendL, sendR, outL, outR, count, fed) {
    if (!fed && this.idle) return;
    this.idle = false;
    const { lines, taps, gains, lows, damp } = this;
    let peak = 0;
    for (let from = 0; from < count; from += this.run) {
      const run = Math.min(this.run, count - from);
      const inputs = [this.enter(fed ? sendL : null, from, run, 0)];
      inputs.push(this.enter(fed ? sendR : null, from, run, 1));
      for (let n = 0; n < 8; n++) {
        const out = n & 1 ? outR : outL;
        const sign = n & 2 ? -WET : WET;
        const run1 = taps[n];
        let low = lows[n];
        tap(lines[n], run1, run);
        for (let i = 0; i < run; i++) {
          const heard = run1[i];
          out[from + i] += heard * sign;
          if (heard > peak || -heard > peak) peak = heard < 0 ? -heard : heard;
          low = heard + (low - heard) * damp;
          run1[i] = low * gains[n];
        }
        lows[n] = low;
      }
      hadamard(taps, run);
      for (let n = 0; n < 8; n++) {
        const input = inputs[n & 1];
        const run1 = taps[n];
        for (let i = 0; i < run; i++) run1[i] += input[i];
        feed(lines[n], run1, run);
      }
    }
    this.rest(fed || peak > SILENT, count);
  }

  /**
   * Once nothing has gone in or come out for as long as two trips of the
   * longest line, forget everything: numbers that only shrink would crawl
   * towards zero for ever, and very small numbers are very slow.
   * @param {boolean} busy
   * @param {number} count
   */
  rest(busy, count) {
    this.quiet = busy ? 0 : this.quiet + count;
    if (this.quiet < this.longest * 2) return;
    for (const { memory } of [...this.lines, ...this.pads]) memory.fill(0);
    this.lows.fill(0);
    this.idle = true;
  }
}
