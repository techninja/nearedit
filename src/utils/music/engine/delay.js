/**
 * The song's delay: echoes in time with the tempo that cross from one side
 * to the other, each a little duller and thinner than the one before.
 * Isomorphic; no state outside the instance.
 * @module utils/music/engine/delay
 */

import { exp } from './math.js';

/** Echoes lose their highs above this, and their lows below the other, Hz. */
const DAMP = 4500;
const THIN = 180;
/** A buffer quieter than this for a whole pass of the line is cleared. */
const SILENT = 1e-7;

export class Delay {
  /**
   * @param {number} seconds - Time between echoes
   * @param {number} feedback - What each echo keeps of the last, 0 … 0.9
   * @param {number} sampleRate
   */
  constructor(seconds, feedback, sampleRate) {
    this.size = Math.max(1, Math.round(seconds * sampleRate));
    this.feedback = feedback;
    this.lineL = new Float64Array(this.size);
    this.lineR = new Float64Array(this.size);
    this.at = 0;
    this.damp = exp((-2 * Math.PI * DAMP) / sampleRate);
    this.thin = exp((-2 * Math.PI * THIN) / sampleRate);
    // Per line: the low-pass and the high-pass memory.
    this.state = new Float64Array(4);
    this.idle = true;
    this.quiet = 0;
  }

  /**
   * Feed the send in and add the echoes to the output.
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
    const { lineL, lineR, size, feedback, damp, thin, state } = this;
    let [lowL, highL, lowR, highR] = state;
    let at = this.at;
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const echoL = lineL[at];
      const echoR = lineR[at];
      // What goes round again: low-passed, then with its lows taken off.
      lowL = echoL + (lowL - echoL) * damp;
      highL = lowL + (highL - lowL) * thin;
      lowR = echoR + (lowR - echoR) * damp;
      highR = lowR + (highR - lowR) * thin;
      const dry = fed ? (sendL[i] + sendR[i]) * 0.5 : 0;
      lineL[at] = dry + (lowR - highR) * feedback;
      lineR[at] = (lowL - highL) * feedback;
      outL[i] += echoL + echoR * 0.3;
      outR[i] += echoR + echoL * 0.3;
      const loud = echoL < 0 ? -echoL : echoL;
      const louder = echoR < 0 ? -echoR : echoR;
      if (loud > peak) peak = loud;
      if (louder > peak) peak = louder;
      if (++at === size) at = 0;
    }
    this.at = at;
    state.set([lowL, highL, lowR, highR]);
    this.rest(fed || peak > SILENT, count);
  }

  /**
   * Once nothing has gone in or come out for two passes of the line, forget
   * everything: numbers that only shrink would crawl towards zero for ever.
   * @param {boolean} busy
   * @param {number} count
   */
  rest(busy, count) {
    this.quiet = busy ? 0 : this.quiet + count;
    if (this.quiet < this.size * 2) return;
    this.lineL.fill(0);
    this.lineR.fill(0);
    this.state.fill(0);
    this.idle = true;
  }
}
