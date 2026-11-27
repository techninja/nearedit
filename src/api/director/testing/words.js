/**
 * Hand-built analysis data for test sidecars: word timestamps and beats.
 * @module api/director/testing/words
 */

/**
 * Word timestamps for a sentence spoken at an even pace. A `|` in the text
 * inserts a pause of `pause` seconds.
 * @param {string} text
 * @param {{ start?: number, step?: number, pause?: number }} [opts]
 * @returns {{ word: string, start: number, end: number, probability: number }[]}
 */
export function say(text, opts = {}) {
  const { start = 0, step = 0.4, pause = 2 } = opts;
  const words = [];
  let at = start;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === '|') {
      at += pause;
      continue;
    }
    words.push({ word: token, start: round(at), end: round(at + step * 0.75), probability: 0.9 });
    at += step;
  }
  return words;
}

/**
 * Evenly spaced beat times.
 * @param {number} bpm
 * @param {number} duration
 * @param {number} [offset=0]
 * @returns {number[]}
 */
export function beatGrid(bpm, duration, offset = 0) {
  const beats = [];
  for (let t = offset; t < duration; t += 60 / bpm) beats.push(round(t));
  return beats;
}

const round = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
