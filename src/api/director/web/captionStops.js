/**
 * What the captions of a site demo are timed and placed by, whoever draws
 * them — the theme's titles (`captions.js`) or the brand kit's caption
 * element (`brandCaptions.js`): the stops of a recording that say
 * something, and where the action shows while a caption is read.
 * @module api/director/web/captionStops
 */

import { shownRect } from './camera.js';

/** @typedef {import('./stage.js').Stage} Stage */
/** @typedef {import('./stage.js').Box} Box */

/** The share of a plate that must be freer at the head for a caption to go there. */
export const CLEARLY = 0.1;
/** The shortest a caption is worth showing, seconds. */
const SHORTEST = 0.4;

/**
 * @param {Box} a
 * @param {Box|null} b
 * @returns {number} The area two boxes share
 */
export function overlap(a, b) {
  if (!b) return 0;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The stops of a recording that say something, each from the first of its
 * steps to the end of its last.
 * @param {{ track: import('#utils/web/types.js').Track, owners: number[], fps: number,
 *   startF: number }} input - `owners`: per step, the stop it belongs to;
 *   `startF`: the frame of the fragment the recording starts on
 * @returns {{ words: string, fromF: number, toF: number, last: any }[]} `last`:
 *   the step of the recording's track the stop ends with
 */
export function captionStops({ track, owners, fps, startF }) {
  const stops = [...new Set(owners)].map((stop) =>
    track.steps.filter((_, i) => owners[i] === stop),
  );
  return stops.flatMap((steps) => {
    const [first, last] = [steps[0], steps[steps.length - 1]];
    const words = (steps.find((step) => step.note)?.note || '').trim();
    const fromF = startF + Math.round(first.start * fps);
    const toF = startF + Math.round(last.end * fps);
    return !words || toF - fromF < SHORTEST * fps ? [] : [{ words, fromF, toF, last }];
  });
}

/**
 * Where the action of a stop shows in the frame while its caption is read:
 * the middle of the pause after it.
 * @param {any} last - The stop's last step
 * @param {Record<string, any[]>} keys - The camera's keyframes
 * @param {import('#utils/web/types.js').Track} track
 * @param {Stage} stage
 * @returns {Box|null} null when the step's target was not seen
 */
export function busyBox(last, keys, track, stage) {
  if (!last.rect || last.missing) return null;
  return shownRect(last.rect, keys, track, stage, (last.actionEnd + last.end) / 2);
}
