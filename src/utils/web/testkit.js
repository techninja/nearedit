/**
 * Fixtures for tests of the zoom maths: a track as the recorder writes it
 * and a way to read the four keyframe lists at a time. Not part of the
 * runtime API — import it from tests.
 * @module utils/web/testkit
 */

import { valueAt } from '#utils/edl/animate.js';

/** The output frame the examples are worked out for. */
export const FRAME = { width: 1920, height: 1080 };
/** A button a little right of and below the middle of a 1280 × 720 page. */
export const BUTTON = { x: 700, y: 380, width: 200, height: 60 };
/** Something in the top left corner of the page. */
export const CORNER = { x: 20, y: 20, width: 160, height: 40 };

/**
 * A track of a 1280 × 720 page recorded at 2×, 30 fps. Steps are `focus`
 * steps that follow one another from 1 s, 0.6 s long with a 1.5 s hold,
 * unless they say otherwise.
 * @param {Record<string, any>[]} steps - Each may set `do`, `rect`, `start`,
 *   `duration`, `hold`, `missing`, `zoom`
 * @param {Record<string, any>} [extra] - Fields of the track to replace
 * @returns {any} A track (`import('./types.js').Track`)
 */
export function trackOf(steps, extra = {}) {
  let at = 1;
  return {
    version: 1,
    fps: 30,
    duration: 60,
    viewport: { width: 1280, height: 720 },
    scale: 2,
    width: 2560,
    height: 1440,
    steps: steps.map((step, index) => {
      const { duration = 0.6, hold = 1.5, start = at, ...rest } = step;
      const actionEnd = start + duration;
      at = actionEnd + hold;
      return { index, do: 'focus', note: '', missing: false, ...rest, start, actionEnd, end: at };
    }),
    ...extra,
  };
}

/**
 * @param {Record<string, { t: number, v: number, ease: string }[]>} keys -
 *   What `zoomKeyframes` returned
 * @param {number} t - Seconds of the recording
 * @returns {number[]} `[scale, x, y]` at that time
 */
export function stateAt(keys, t) {
  const paths = ['transform.scaleX', 'transform.x', 'transform.y'];
  return paths.map((path) => /** @type {number} */ (valueAt(keys[path], t)));
}
