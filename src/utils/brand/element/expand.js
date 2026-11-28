/**
 * Expansion — a design, its slots, a length and a frame in; ordinary clips
 * out. This is how an element clip draws: the compositor expands its design
 * for the clip's own length and the frame it is drawn in, and draws the
 * layers it gets. Pure and deterministic — the same input gives equal
 * clips, so a host may keep the result for as long as its input stays the
 * same. A design that is broken or hostile expands to nothing with a
 * warning; it never throws inside a frame.
 * Isomorphic. Contract: docs/app-spec/BRAND.md § Element clips.
 * @module utils/brand/element/expand
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS } from '#utils/brand/limits.js';
import { layerClip } from './layerClips.js';
import { layoutView } from './layout.js';
import { estimateMeasure, num } from './measure.js';
import { timings } from './timing.js';
import { viewOf } from './view.js';
import { formatOf } from './vocabulary.js';

/** @typedef {import('#utils/brand/types.js').Design} Design */
/** @typedef {import('#utils/brand/types.js').ExpandOptions} ExpandOptions */

/** A frame side outside this is not laid out, output pixels. */
const SIDES = [16, 16384];

/**
 * @param {any} frame
 * @returns {{ width: number, height: number }|null} The frame when it can be laid out in
 */
function usableFrame(frame) {
  const ok = (/** @type {any} */ side) => Number.isFinite(side) && side >= SIDES[0];
  if (!ok(frame?.width) || !ok(frame?.height)) return null;
  return { width: Math.min(SIDES[1], frame.width), height: Math.min(SIDES[1], frame.height) };
}

/**
 * Expand a design into the clips that draw it, **back to front**: title
 * clips, shape and other generator clips, image clips — with transforms,
 * keyframes and effects, their times inside `0 … duration`.
 * @param {Design} design - As `resolveElement` made it, or as a clip carries it
 * @param {Record<string, string>|undefined} slots - What is filled in
 * @param {ExpandOptions} options - The length and the frame; `measure` and
 *   `sizeOf` from a host that draws (without them text widths are
 *   estimated, see `measure.js`, and pictures are taken to be square)
 * @returns {any[]} Clips; empty when the design cannot be expanded
 */
export function expandElement(design, slots, options) {
  const warn = typeof options?.warn === 'function' ? options.warn : () => {};
  try {
    const frame = usableFrame(options?.frame);
    const [shortest, longest] = [1e-3, LIMITS.duration[1] * 10];
    const duration = num(options?.duration, 0, 0, longest);
    if (!isPlainObject(design) || !Array.isArray(design.layers) || !frame) {
      warn('an element without a design, layers or a frame draws nothing');
      return [];
    }
    if (!(duration > shortest)) return [];
    const unit = Math.min(frame.width, frame.height) / 100;
    const view = viewOf(design, isPlainObject(slots) ? slots : {}, formatOf(frame));
    const env = {
      frame,
      unit,
      measure: typeof options.measure === 'function' ? options.measure : estimateMeasure,
      sizeOf: typeof options.sizeOf === 'function' ? options.sizeOf : () => null,
      warn,
      groups: view.groups,
    };
    const placed = layoutView(view, env);
    const times = timings(view, duration);
    return view.layers.flatMap((layer) => {
      const [where, when] = [placed.get(layer.id), times.get(layer.id)];
      return (where && when && layerClip(layer, where, when, env)) || [];
    });
  } catch (err) {
    warn(`an element could not be expanded and draws nothing: ${err?.message || err}`);
    return [];
  }
}

/**
 * The moment a transition covers the frame — where the cut belongs under it.
 * @param {Design} design
 * @param {number} duration - Seconds the element lasts
 * @returns {number} Seconds from its start: `cover` × the length (half way by default)
 */
export function coverTime(design, duration) {
  return num(design?.cover, 0.5, 0, 1) * Math.max(0, duration);
}
