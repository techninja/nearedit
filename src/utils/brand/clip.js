/**
 * What a clip's `element` block says about the clip: whether it is an
 * element clip, and which stretch of its track it plays in. Element clips
 * that touch on one track and carry the same element are one **run**: the
 * run arrives once, at its start, and leaves once, at its end — so cutting
 * an element in two changes nothing on screen, and a piece that is moved
 * away, or loses its neighbour, arrives and leaves on its own again.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § Element clips.
 * @module utils/brand/clip
 */

import { isPlainObject, sameJson } from '#utils/edl/jsonBag.js';

/** @typedef {import('./types.js').ElementBlock} ElementBlock */
/** @typedef {{ element?: Partial<ElementBlock> } | null | undefined} ElementHolder */

/** Float tolerance, seconds, when two clips are said to touch. */
const TOUCH = 1e-6;

/** @type {WeakMap<object, WeakMap<object, boolean>>} */
const compared = new WeakMap();

/**
 * @param {ElementHolder} clip
 * @returns {boolean} True for a clip that carries a design
 */
export function isElementClip(clip) {
  return isPlainObject(clip?.element?.design);
}

/**
 * Whether two `element` blocks are the same element: the same kit revision,
 * the same element, the same slots, the same design.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function sameElement(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  let known = compared.get(a);
  if (!known) compared.set(a, (known = new WeakMap()));
  if (!known.has(b)) {
    const same =
      a.id === b.id &&
      a.kit?.id === b.kit?.id &&
      a.kit?.key === b.kit?.key &&
      sameJson(a.slots, b.slots) &&
      sameJson(a.design, b.design);
    known.set(b, same);
  }
  return known.get(b);
}

/**
 * The run an element clip belongs to: from the start of the first piece to
 * the end of the last, through every piece of the same element that touches
 * the next on the same track. An element's motion is timed in this span.
 * @param {{ clips?: any[] } | null | undefined} track - The track that holds the clip
 * @param {{ clipId?: string, timelineStart: number, timelineEnd: number, element?: any }} clip
 * @returns {{ start: number, end: number }} Timeline seconds; the clip's own
 *   span when it stands alone
 */
export function elementSpan(track, clip) {
  let { timelineStart: start, timelineEnd: end } = clip;
  const pieces = (track?.clips || []).filter(
    (other) =>
      other.clipId !== clip.clipId && isElementClip(other) && sameElement(other.element, clip.element),
  );
  for (let grown = pieces.length > 0; grown; ) {
    grown = false;
    for (const piece of pieces) {
      if (Math.abs(piece.timelineEnd - start) < TOUCH) {
        start = piece.timelineStart;
        grown = true;
      } else if (Math.abs(piece.timelineStart - end) < TOUCH) {
        end = piece.timelineEnd;
        grown = true;
      }
    }
  }
  return { start, end };
}
