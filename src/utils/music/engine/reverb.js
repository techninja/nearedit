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

/** Line lengths in samples at 48 kHz and size 1: primes, 26 … 68 ms. */
const LINES = [1259, 1433, 1627, 1861, 2129, 2423, 2767, 3251];
/** All-pass lengths in front of the lines, left and right. */
const DIFFUSERS = [229, 613, 241, 641];
const DIFFUSION = 0.6;
/** Highs above this die faster, Hz; lows below the other never get in. */
const DAMP = 5500;
const THIN = 140;
const SILENT = 1e-7;
const HALF = 0.35355339059327373; // 1 / √8

/**
 * @param {number} n
 * @returns {number} The first prime at or above n
 */
function primeFrom(n) {
  for (let p = Math.max(2, Math.round(n)); ; p++) {
    let prime = true;
    for (let d = 2; d * d <= p && prime; d++) prime = p % d !== 0;
    if (prime) return p;
  }
}

export class Reverb {
  /**
   * @param {number} size - 0 (a small room) … 1 (a hall)
   * @param {number} decay - 0 (0.3 s to fall 60 dB) … 1 (8 s)
   * @param {number} sampleRate
   */
  constructor(size, decay, sampleRate) {
    const scale = ((0.45 + 1.1 * size) * sampleRate) / 48000;
    const seconds = 0.3 * exp(decay * 3.2834);
    this.lengths = LINES.map((length, i) => primeFrom(length * scale + i));
    this.lines = this.lengths.map((length) => new Float64Array(length));
    this.gains = this.lengths.map((length) => exp((-6.9078 * length) / (seconds * sampleRate)));
    this.at = new Int32Array(8);
    this.lows = new Float64Array(8);
    this.pads = DIFFUSERS.map((length) => new Float64Array(primeFrom((length * sampleRate) / 48000)));
    this.padAt = new Int32Array(4);
    this.damp = exp((-2 * Math.PI * DAMP) / sampleRate);
    this.thin = exp((-2 * Math.PI * THIN) / sampleRate);
    this.inLow = new Float64Array(2);
    this.mixed = new Float64Array(8);
    this.idle = true;
    this.quiet = 0;
  }

  /**
   * One sample through an all-pass.
   * @param {number} which - 0 … 3
   * @param {number} x
   * @returns {number}
   */
  diffuse(which, x) {
    const pad = this.pads[which];
    const at = this.padAt[which];
    const delayed = pad[at];
    const fed = x + delayed * DIFFUSION;
    pad[at] = fed;
    this.padAt[which] = at + 1 === pad.length ? 0 : at + 1;
    return delayed - fed * DIFFUSION;
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
    const { lines, lengths, gains, at, lows, damp, thin, inLow, mixed: v } = this;
    let peak = 0;
    for (let i = 0; i < count; i++) {
      let inL = fed ? sendL[i] : 0;
      let inR = fed ? sendR[i] : 0;
      inLow[0] = inL + (inLow[0] - inL) * thin;
      inLow[1] = inR + (inLow[1] - inR) * thin;
      inL = this.diffuse(1, this.diffuse(0, inL - inLow[0]));
      inR = this.diffuse(3, this.diffuse(2, inR - inLow[1]));
      let wetL = 0;
      let wetR = 0;
      for (let n = 0; n < 8; n++) {
        const out = lines[n][at[n]];
        lows[n] = out + (lows[n] - out) * damp;
        v[n] = lows[n] * gains[n];
        if (n & 1) wetR += n & 2 ? -out : out;
        else wetL += n & 2 ? -out : out;
      }
      hadamard(v);
      for (let n = 0; n < 8; n++) {
        lines[n][at[n]] = (n & 1 ? inR : inL) + v[n] * HALF;
        at[n] = at[n] + 1 === lengths[n] ? 0 : at[n] + 1;
      }
      outL[i] += wetL * WET;
      outR[i] += wetR * WET;
      const loud = (wetL < 0 ? -wetL : wetL) + (wetR < 0 ? -wetR : wetR);
      if (loud > peak) peak = loud;
    }
    this.rest(fed || peak > SILENT, count);
  }

  /**
   * Once nothing has gone in or come out for as long as two trips of the
   * longest line, forget everything (see `Delay.rest`).
   * @param {boolean} busy
   * @param {number} count
   */
  rest(busy, count) {
    this.quiet = busy ? 0 : this.quiet + count;
    if (this.quiet < this.lengths[7] * 2) return;
    for (const line of [...this.lines, ...this.pads]) line.fill(0);
    this.lows.fill(0);
    this.inLow.fill(0);
    this.idle = true;
  }
}

/** Level of the reverberation against what was sent. */
const WET = 0.3;

/**
 * Mix eight values so that each ends up in all eight, in place.
 * @param {Float64Array} v
 */
function hadamard(v) {
  for (let span = 1; span < 8; span *= 2) {
    for (let i = 0; i < 8; i += span * 2) {
      for (let j = i; j < i + span; j++) {
        const a = v[j];
        const b = v[j + span];
        v[j] = a + b;
        v[j + span] = a - b;
      }
    }
  }
}
