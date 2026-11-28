/**
 * Where an element clip's picture is inside its frame-sized layer: the
 * rectangle around every layer of its design, laid out for a frame with
 * what is filled in. The preview's box and handles go around it (a lower
 * third is grabbed by its plate, not by the whole frame) and a tile of the
 * Create tab is framed on it. It is the brand model's own layout, so it is
 * where the compositor draws. Pure and isomorphic.
 * @module utils/brandUi/elementBounds
 */

import { layoutView } from '#utils/brand/element/layout.js';
import { estimateMeasure } from '#utils/brand/element/measure.js';
import { viewOf } from '#utils/brand/element/view.js';
import { formatOf } from '#utils/brand/element/vocabulary.js';

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */
/** @typedef {{ width: number, height: number }} Size */

/** Smallest side of the rectangle, output pixels, so a tiny mark can still be grabbed. */
const MIN_SIDE = 24;

/**
 * @param {Size} frame
 * @returns {Rect} The whole frame
 */
const whole = (frame) => ({ x: 0, y: 0, width: frame.width, height: frame.height });

/**
 * The rectangle around an element's layers at rest, inside the frame.
 * @param {{ design?: any, slots?: Record<string, string> }|null|undefined} element - A
 *   clip's `element` block
 * @param {Size} frame - Output size, pixels
 * @param {{ measure?: import('#utils/brand/types.js').ExpandOptions['measure'],
 *   sizeOf?: import('#utils/brand/types.js').ExpandOptions['sizeOf'] }} [host] - A host's
 *   text measure and picture sizes; without them widths are estimated
 * @returns {Rect} The whole frame for a design that fills it, that draws
 *   nothing, or that cannot be laid out
 */
export function elementBounds(element, frame, host = {}) {
  if (!element?.design || !(frame?.width > 0) || !(frame?.height > 0)) return whole(frame);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  try {
    const view = viewOf(element.design, element.slots || {}, formatOf(frame));
    const placed = layoutView(view, {
      frame,
      unit: Math.min(frame.width, frame.height) / 100,
      measure: host.measure || estimateMeasure,
      sizeOf: host.sizeOf || (() => null),
      warn: () => {},
    });
    for (const layer of view.layers) {
      const where = placed.get(layer.id);
      if (!where) continue;
      // A generator layer paints the whole frame, whatever box it was given.
      if (layer.type === 'generator') return whole(frame);
      const { box } = where;
      left = Math.min(left, box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.w);
      bottom = Math.max(bottom, box.y + box.h);
    }
  } catch (err) {
    console.warn('[brand] an element could not be laid out:', err?.message || err);
    return whole(frame);
  }
  if (!(right > left) || !(bottom > top)) return whole(frame);
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const width = Math.max(MIN_SIDE, Math.min(frame.width, right) - x);
  const height = Math.max(MIN_SIDE, Math.min(frame.height, bottom) - y);
  return {
    x: Math.min(x, frame.width - width),
    y: Math.min(y, frame.height - height),
    width,
    height,
  };
}

/**
 * The part of the frame a small picture of an element shows: its bounds
 * with room around them, in the frame's own shape, never closer than
 * `closest` times — so a lower third can be read on a tile and still sits
 * visibly low in a frame.
 * @param {Rect} bounds - As `elementBounds` gives them
 * @param {Size} frame
 * @param {number} [closest=2.2] - The most the picture is enlarged
 * @returns {Rect} The whole frame for an element that fills most of it
 */
export function framing(bounds, frame, closest = 2.2) {
  const room = 0.16 * Math.min(frame.width, frame.height);
  const share = Math.max(
    (bounds.width + 2 * room) / frame.width,
    (bounds.height + 2 * room) / frame.height,
    1 / closest,
  );
  if (share >= 0.9) return whole(frame);
  const width = frame.width * share;
  const height = frame.height * share;
  const x = bounds.x + bounds.width / 2 - width / 2;
  const y = bounds.y + bounds.height / 2 - height / 2;
  return {
    x: Math.max(0, Math.min(frame.width - width, x)),
    y: Math.max(0, Math.min(frame.height - height, y)),
    width,
    height,
  };
}
