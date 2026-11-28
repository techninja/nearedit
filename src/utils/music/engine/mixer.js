/**
 * The mix of a song: every part played, set to its volume and place, sent
 * to the delay and the reverb, summed, and limited. It works in blocks of
 * `BLOCK` samples that always start on the same samples of the song, so the
 * result does not depend on how a render is cut into chunks.
 * Isomorphic; no state outside the instance.
 * @module utils/music/engine/mixer
 */

import { Delay } from './delay.js';
import { DrumPart } from './drums.js';
import { Limiter } from './limiter.js';
import { exp, sinTurn } from './math.js';
import { Reverb } from './reverb.js';
import { SynthPart } from './synth.js';

/** Samples per block: a whole number of control ticks. */
export const BLOCK = 128;
/** Rumble below this is taken off the mix, Hz. */
const DC = 12;

export class Mixer {
  /**
   * @param {any} song - Normalised
   * @param {number} sampleRate
   */
  constructor(song, sampleRate) {
    const { master } = song;
    this.channels = song.parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => !part.mute && part.volume > 0)
      .map(({ part, index }) => {
        const angle = (part.pan + 1) / 8;
        const Player = part.kind === 'drums' ? DrumPart : SynthPart;
        return {
          player: new Player(song, part, sampleRate, index, BLOCK),
          left: part.volume * Math.SQRT2 * sinTurn(0.25 - angle),
          right: part.volume * Math.SQRT2 * sinTurn(angle),
          reverb: part.reverb,
          delay: part.delay,
        };
      });
    const beat = 60 / song.bpm;
    this.delay = new Delay(master.delay.beats * beat, master.delay.feedback, sampleRate);
    this.reverb = new Reverb(master.reverb.size, master.reverb.decay, sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.latency = this.limiter.latency;
    this.volume = master.volume;
    this.keep = exp((-2 * Math.PI * DC) / sampleRate);
    this.dc = new Float64Array(4);
    const buffer = () => new Float64Array(BLOCK);
    this.buses = { partL: buffer(), partR: buffer(), revL: buffer(), revR: buffer() };
    Object.assign(this.buses, { echoL: buffer(), echoR: buffer() });
  }

  /**
   * Mix one block.
   * @param {Float64Array} outL - Receives `BLOCK` samples
   * @param {Float64Array} outR
   * @param {number} pos - Sample of the song the block starts at
   */
  process(outL, outR, pos) {
    const { partL, partR, revL, revR, echoL, echoR } = this.buses;
    outL.fill(0);
    outR.fill(0);
    let reverbFed = false;
    let delayFed = false;
    for (const channel of this.channels) {
      partL.fill(0);
      partR.fill(0);
      if (!channel.player.render(partL, partR, pos, BLOCK)) continue;
      if (channel.reverb > 0 && !reverbFed) reverbFed = Boolean(revL.fill(0) && revR.fill(0));
      if (channel.delay > 0 && !delayFed) delayFed = Boolean(echoL.fill(0) && echoR.fill(0));
      for (let i = 0; i < BLOCK; i++) {
        const l = partL[i] * channel.left;
        const r = partR[i] * channel.right;
        outL[i] += l;
        outR[i] += r;
        if (channel.reverb > 0) {
          revL[i] += l * channel.reverb;
          revR[i] += r * channel.reverb;
        }
        if (channel.delay > 0) {
          echoL[i] += l * channel.delay;
          echoR[i] += r * channel.delay;
        }
      }
    }
    this.delay.process(echoL, echoR, outL, outR, BLOCK, delayFed);
    this.reverb.process(revL, revR, outL, outR, BLOCK, reverbFed);
    this.finish(outL, outR);
  }

  /**
   * Master volume, the rumble filter and the limiter, in place.
   * @param {Float64Array} outL
   * @param {Float64Array} outR
   */
  finish(outL, outR) {
    const { dc, keep, volume } = this;
    let [lastL, heldL, lastR, heldR] = dc;
    for (let i = 0; i < BLOCK; i++) {
      const l = outL[i] * volume;
      const r = outR[i] * volume;
      heldL = l - lastL + keep * heldL;
      heldR = r - lastR + keep * heldR;
      lastL = l;
      lastR = r;
      // Numbers that only shrink would crawl towards zero for ever.
      if (heldL < 1e-15 && heldL > -1e-15) heldL = 0;
      if (heldR < 1e-15 && heldR > -1e-15) heldR = 0;
      outL[i] = heldL;
      outR[i] = heldR;
    }
    dc.set([lastL, heldL, lastR, heldR]);
    this.limiter.process(outL, outR, BLOCK);
  }
}
