/**
 * Playing a rendered song in a loop through Web Audio, and changing what
 * plays without a gap or a click. A song is one buffer; every pass through
 * the looped bars is one source node started on the audio clock, so passes
 * follow each other to the sample. When the loop is the whole song the
 * pass before rings out under the next one (its tail is in the buffer);
 * a loop inside the song cross-fades over a few milliseconds instead.
 * After an edit the new buffer takes over at the next bar line — or where
 * the loop starts again, whichever comes first — with the same short
 * cross-fade, which is inaudible wherever the two buffers agree.
 * Everything is planned from the bars, so a change of tempo keeps its place.
 * @module utils/musicUi/loopPlayer
 */

import { cancelVoices, launchVoice, retireVoice, stopVoice, sweepVoices } from './loopVoices.js';

/** @typedef {import('./loopVoices.js').Voice} Voice */
/** @typedef {import('./loopVoices.js').Take} Take */

/** Seconds ahead of the loop's end that the next pass is put on the clock. */
export const AHEAD = 1.2;
/** A change is not planned for a bar line closer than this, seconds. */
export const LEAD = 0.04;
const TICK_MS = 50;

/**
 * @param {number[]} bars - Seconds of every bar line
 * @param {number} time - Seconds into the song
 * @returns {number} Where that is, in bars (fractional); past the last line
 *   it keeps counting at the pace of the last bar
 */
export function barAt(bars, time) {
  let index = 0;
  while (index < bars.length - 2 && bars[index + 1] <= time) index += 1;
  const length = bars[index + 1] - bars[index] || 1;
  return index + (time - bars[index]) / length;
}

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} output
 * @param {{ every?: (run: () => void, ms: number) => any, cancel?: (id: any) => void }} [timers]
 * @returns {{ start: (take: Take, loop: number[]) => void, replan: (take?: Take, loop?: number[]) => void,
 *   stop: () => void, position: () => { time: number, bar: number }|null, playing: () => boolean,
 *   voices: () => Voice[] }}
 */
export function createLoopPlayer(ctx, output, timers = {}) {
  const every = timers.every || ((run, ms) => setInterval(run, ms));
  const cancel = timers.cancel || ((id) => clearInterval(id));
  /** @type {Voice[]} */
  let voices = [];
  /** @type {Take|null} */
  let latest = null;
  let loop = [0, 1];
  /** @type {any} */
  let ticker = null;

  /** @param {number} at @param {number} bar */
  const launch = (at, bar) => voices.push(launchVoice(ctx, output, latest, { at, bar, loop }));
  /** @param {number} now @returns {Voice|undefined} The voice that is (about to be) heard */
  const current = (now) => voices.filter((voice) => voice.from <= now + LEAD).pop();

  /** Put the next pass on the clock when the loop's end is near. */
  function tick() {
    const now = ctx.currentTime;
    voices = sweepVoices(voices, now);
    const last = voices[voices.length - 1];
    if (!last || last.until < Infinity || last.end - now > AHEAD) return;
    retireVoice(last, last.end, last.rings);
    launch(last.end, loop[0]);
  }

  /** Fade everything out and stop the clockwork. */
  function stop() {
    if (ticker !== null) cancel(ticker);
    ticker = null;
    for (const voice of voices) stopVoice(voice, ctx.currentTime);
    voices = [];
  }

  /**
   * Plan again from where the music is: with another buffer, other bars
   * to loop, or both.
   * @param {Take} [take]
   * @param {number[]} [bars]
   */
  function replan(take = latest, bars = loop) {
    latest = take;
    loop = bars;
    if (!ticker) return;
    const now = ctx.currentTime;
    const heard = current(now);
    if (!heard) return;
    voices = cancelVoices(voices, heard, now);
    const at = Math.max(heard.s0, heard.s0 + (now - heard.t0));
    let line = Math.floor(barAt(heard.bars, at) + 1e-9) + 1;
    const clock = (/** @type {number} */ index) => heard.t0 + (heard.bars[index] - heard.s0);
    if (clock(line) - now < LEAD) line += 1;
    const wrap = !(clock(line) < heard.end - 1e-6);
    const inside = line >= loop[0] && line < loop[1];
    const when = wrap ? heard.end : clock(line);
    retireVoice(heard, when, wrap && heard.rings);
    launch(when, wrap || !inside ? loop[0] : line);
  }

  return {
    start(take, bars) {
      stop();
      latest = take;
      loop = bars;
      launch(ctx.currentTime + LEAD, loop[0]);
      ticker = every(tick, TICK_MS);
    },
    replan,
    stop,
    position() {
      const now = ctx.currentTime;
      const heard = voices.filter((voice) => voice.from <= now).pop();
      if (!heard || ticker === null) return null;
      const time = Math.max(heard.s0, heard.s0 + (now - heard.t0));
      return { time, bar: barAt(heard.bars, time) };
    },
    playing: () => ticker !== null,
    voices: () => voices,
  };
}
