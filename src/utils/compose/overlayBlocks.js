/**
 * What a brand overlay keeps of the frame — for the caption pass, which
 * draws captions clear of it. An overlay is an element clip of kind
 * `overlay` (a lower third, a logo bug, a caption element, a title, a
 * quote) on a track that is seen. Its place is its box **at rest**
 * (`elementBounds`: the brand model's own layout, measured with this host's
 * fonts, as it is drawn) under the clip's own transform — a lower third the
 * user dragged elsewhere is where the user put it — at every moment of a
 * stretch of time, keyframes and ken burns included. Segments and
 * transitions fill the frame: there is no way round them, and they do not
 * count.
 * Isomorphic. Reference: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/compose/overlayBlocks
 */

import { isElementClip } from '#utils/brand/clip.js';
import { elementBounds } from '#utils/brand/element/bounds.js';
import { boxCorners, clipBox } from '#utils/preview/geometry.js';
import { fontsReady, layoutHost, pictureSizes } from './elementExpansion.js';
import { trackOpacity, tracksBackToFront } from './layers.js';

/**
 * @typedef {import('#utils/captions/types.js').Rect} Rect
 * @typedef {import('./drawClip.js').FrameRun} FrameRun
 */

/**
 * What is in the frame during a stretch of time.
 * @typedef {Object} Blocks
 * @property {Rect[]} rects - Output pixels, one per overlay that is seen
 * @property {[element: any, sizes: string][]} pictures - The elements whose
 *   place depends on a picture's size, with the sizes it was worked out from
 *   (`pictureSizes`): the answer holds while they are the same
 * @property {boolean} settled - Every font the boxes were measured in has
 *   arrived: the answer is one to keep
 */

/** Moments at which a moving element is looked at during a stretch. */
const SAMPLES = 9;
/** Stretches that share less than this, seconds, do not meet. */
const MEET = 1e-6;

/** @type {WeakMap<object, { key: string, fonts: any, box: Rect|null }>} By `element` block */
const boxes = new WeakMap();

/**
 * The overlay element clips of a document that are seen: those of tracks
 * that are not hidden — muted, or left out by a solo — nor fully transparent.
 * @param {any} edl
 * @returns {any[]}
 */
export function overlayClips(edl) {
  return tracksBackToFront(edl)
    .filter((track) => trackOpacity(track) > 0)
    .flatMap((track) => track.clips || [])
    .filter((clip) => isElementClip(clip) && clip.element.design.kind === 'overlay');
}

/**
 * Where an element is in the output frame at rest.
 * @param {any} element - A clip's `element` block
 * @param {FrameRun} run
 * @param {any} ctx - Any context of this host, to measure text with
 * @returns {{ box: Rect|null, ready: boolean }} `box`: null for an element
 *   that fills the frame; `ready`: its fonts have arrived, so the box is
 *   the one it will keep
 */
function restBox(element, run, ctx) {
  const { outWidth: width, outHeight: height, fonts } = run.frame;
  const key = `${width}x${height}|${pictureSizes(element, run)}`;
  const known = boxes.get(element);
  if (known && known.key === key && known.fonts === fonts) return { box: known.box, ready: true };
  const rect = elementBounds(element, { width, height }, layoutHost(run, ctx));
  const box = rect.width >= width && rect.height >= height ? null : rect;
  const ready = fontsReady(element, run);
  if (ready) boxes.set(element, { key, fonts, box });
  return { box, ready };
}

/**
 * The part of the frame an element clip covers while a stretch of time passes.
 * @param {any} edl
 * @param {any} clip - An element clip
 * @param {Rect} rect - Its box at rest
 * @param {number} from - Timeline seconds
 * @param {number} to
 * @returns {Rect|null} null when it is not seen at all (opacity 0, scaled to nothing)
 */
function covered(edl, clip, rect, from, to) {
  const keyed = Object.keys(clip.keyframes || {}).length > 0;
  const steps = keyed || clip.transform?.kenBurns?.enabled === true ? SAMPLES : 1;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < steps; i++) {
    const time = from + ((to - from) * i) / Math.max(1, steps - 1);
    const box = clipBox(edl, clip, time, null, rect);
    if (!(box.transform.opacity > 0 && box.width > 0 && box.height > 0)) continue;
    for (const { x, y } of boxCorners(box)) {
      [left, top] = [Math.min(left, x), Math.min(top, y)];
      [right, bottom] = [Math.max(right, x), Math.max(bottom, y)];
    }
  }
  return right > left ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/**
 * What overlays keep of the frame at any moment of a stretch of time.
 * @param {any[]} clips - From `overlayClips`
 * @param {number} from - Timeline seconds
 * @param {number} to
 * @param {FrameRun} run
 * @param {any} ctx - Any context of this host, to measure text with
 * @returns {Blocks}
 */
export function blocksDuring(clips, from, to, run, ctx) {
  /** @type {Blocks} */
  const found = { rects: [], pictures: [], settled: true };
  for (const clip of clips) {
    const [start, end] = [Math.max(from, clip.timelineStart), Math.min(to, clip.timelineEnd)];
    if (!(end - start > MEET)) continue;
    const { box, ready } = restBox(clip.element, run, ctx);
    found.settled &&= ready;
    const sizes = pictureSizes(clip.element, run);
    if (sizes) found.pictures.push([clip.element, sizes]);
    const rect = box && covered(run.edl, clip, box, start, end);
    if (rect) found.rects.push(rect);
  }
  return found;
}
