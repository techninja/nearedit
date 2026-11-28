/**
 * Boxes — the rectangles a layout is made of, in output pixels from the
 * frame's top left corner, and the few ways one box is placed by another:
 * held at an anchor inside it, grown around it, set beside one of its
 * sides. Isomorphic and pure.
 * @module utils/brand/element/box
 */

import { lengthOf, num } from './measure.js';
import { ANCHORS, SIDES } from './vocabulary.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ w: number, h: number }} Size */

/** Where along a side something sits: `align` → 0 (start) … 1 (end). */
const ALONG = { left: 0, center: 0.5, right: 1 };

/**
 * The frame, and the frame inside its safe margins.
 * @param {{ width: number, height: number }} frame - Output pixels
 * @param {number} margin - Pixels
 * @returns {{ frame: Box, safe: Box }}
 */
export function frameBoxes(frame, margin) {
  const m = Math.max(0, Math.min(margin, frame.width * 0.45, frame.height * 0.45));
  return {
    frame: { x: 0, y: 0, w: frame.width, h: frame.height },
    safe: { x: m, y: m, w: frame.width - 2 * m, h: frame.height - 2 * m },
  };
}

/**
 * Hold a box at an anchor of a container: the same point of both coincide,
 * then the offsets apply. With `keep` the box is brought back inside that
 * box wherever it fits.
 * @param {Size} size
 * @param {Box} container
 * @param {{ at?: string, x?: any, y?: any }} spec - Anchor, offsets in units
 * @param {number} unit - Pixels per unit
 * @param {Box|null} [keep]
 * @returns {Box}
 */
export function anchored(size, container, spec, unit, keep = null) {
  const [ax, ay] = ANCHORS[spec.at] || ANCHORS.center;
  let x = container.x + ax * (container.w - size.w) + num(spec.x, 0, -200, 200) * unit;
  let y = container.y + ay * (container.h - size.h) + num(spec.y, 0, -200, 200) * unit;
  if (keep) {
    x = size.w <= keep.w ? Math.max(keep.x, Math.min(keep.x + keep.w - size.w, x)) : keep.x;
    y = size.h <= keep.h ? Math.max(keep.y, Math.min(keep.y + keep.h - size.h, y)) : keep.y;
  }
  return { x, y, w: size.w, h: size.h };
}

/**
 * A box grown on every side.
 * @param {Box} box
 * @param {number} px - Pixels, left and right
 * @param {number} py - Pixels, top and bottom
 * @returns {Box}
 */
export function grown(box, px, py) {
  return { x: box.x - px, y: box.y - py, w: box.w + 2 * px, h: box.h + 2 * py };
}

/**
 * The size a `beside` shape takes from the box it runs along: its
 * `thickness` across, `span` × that side's length along.
 * @param {Record<string, any>} layer
 * @param {Box} box
 * @param {number} unit
 * @returns {Size}
 */
export function besideSize(layer, box, unit) {
  const thickness = num(layer.thickness, 0.4, 0, 100) * unit;
  const span = num(layer.span, 1, 0, 4);
  return layer.side === 'top' || layer.side === 'bottom'
    ? { w: lengthOf(layer.w, box.w, unit, box.w * span), h: thickness }
    : { w: thickness, h: lengthOf(layer.h, box.h, unit, box.h * span) };
}

/**
 * Set a size beside one side of a box, `gap` away, at `align` along it.
 * @param {Size} size
 * @param {Box} box
 * @param {{ side?: string, gap?: any, align?: string }} spec
 * @param {number} unit
 * @returns {Box}
 */
export function beside(size, box, spec, unit) {
  const side = SIDES.includes(spec.side) ? spec.side : 'left';
  const gap = num(spec.gap, 0, -100, 100) * unit;
  const along = ALONG[spec.align] ?? 0.5;
  const x =
    side === 'left'
      ? box.x - gap - size.w
      : side === 'right'
        ? box.x + box.w + gap
        : box.x + (box.w - size.w) * along;
  const y =
    side === 'top'
      ? box.y - gap - size.h
      : side === 'bottom'
        ? box.y + box.h + gap
        : box.y + (box.h - size.h) * along;
  return { x, y, w: size.w, h: size.h };
}
