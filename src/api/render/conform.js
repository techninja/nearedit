/**
 * Frame choice — which source frame an output frame shows. Both renderers
 * read footage through these arguments and filters, so a clip shows the
 * same frames whether it goes through the filter graph or the compositor,
 * in a whole render, a range or a segment. Pure.
 * Reference: docs/app-spec/RENDER.md § Picture graph, "Conform".
 * @module api/render/conform
 */

import { filter, num } from './expr.js';

/**
 * Seconds of video decoded ahead of a clip's first frame, so the frame that
 * is on screen at that moment (it may have started earlier) is available.
 * @param {number} fps - Output frame rate
 * @returns {number}
 */
const preRoll = (fps) => Math.max(3 / fps, 0.1);

/**
 * Input options for a file. Videos are seeked and bounded so only the used
 * part is decoded; images are read once.
 * @param {string} file
 * @param {boolean} still
 * @param {{ seek: number, count: number }} window
 * @param {number} fps
 * @returns {{ args: string[], lead: number }} `lead` is how long before the
 *   clip's first frame the input starts
 */
export function openInput(file, still, window, fps) {
  if (!still) {
    const from = Math.max(0, window.seek - preRoll(fps));
    const lead = window.seek - from;
    const read = ['-ss', num(from), '-t', num(window.count / fps + lead + 0.001, 4)];
    return { args: [...read, '-an', '-sn', '-dn', '-i', file], lead };
  }
  // A literal % or glob character would otherwise be read as a sequence pattern.
  const literal = /[%*?[\]{}]/.test(file) ? ['-f', 'image2', '-pattern_type', 'none'] : [];
  return { args: [...literal, '-i', file], lead: 0 };
}

/**
 * Bring a source to the output frame rate. Each output frame shows what a
 * player would show at that moment: the latest source frame that has
 * started, give or take a third of a frame so timestamps that are rounded
 * or jitter (variable-rate phone video) do not make frames repeat. The input
 * starts a little early (`lead`) so that frame is there for the first one.
 * @param {{ still?: boolean, lead?: number }} spec
 * @param {{ fps: number, fpsText: string }} timing
 * @returns {string[]}
 */
export function conformFilters(spec, { fps, fpsText }) {
  if (spec.still) return [filter('fps', { fps: fpsText, start_time: 0 })];
  // 0.3 of a frame: 24, 25, 50 and 60 fps sources never land exactly on it.
  const tolerance = Math.min(0.3 / fps, 0.012);
  const shift = Math.round(((spec.lead || 0) + tolerance) * 1e6);
  // Microsecond time base, so the shift is exact whatever the container's.
  return [
    'settb=AVTB',
    `setpts=PTS-${shift}`,
    filter('fps', { fps: fpsText, round: 'up', start_time: 0 }),
  ];
}

/**
 * Exactly `count` frames: hold the last one if the source runs short (a
 * container's stated duration is often a frame or two longer than its
 * video), cut what is left over.
 * @param {number} count
 * @param {number} fps
 * @returns {string[]}
 */
export function holdFilters(count, fps) {
  return [
    filter('tpad', { stop_mode: 'clone', stop_duration: num(count / fps + 1, 3) }),
    filter('trim', { end_frame: count }),
  ];
}
