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

/**
 * @typedef {{ measure?: import('#utils/brand/types.js').ExpandOptions['measure'],
 *   sizeOf?: import('#utils/brand/types.js').ExpandOptions['sizeOf'] }} Host
 */

/** Smallest side of the rectangle, output pixels, so a tiny mark can still be grabbed. */
const MIN_SIDE = 24;
/** A layer over this share of the frame is a cover behind the content. */
const COVER = 0.8;

/**
 * @param {Size} frame
 * @returns {Rect} The whole frame
 */
const whole = (frame) => ({ x: 0, y: 0, width: frame.width, height: frame.height });

/**
 * The boxes of an element's layers at rest, cut to the frame.
 * @param {{ design: any, slots?: Record<string, string> }} element
 * @param {Size} frame
 * @param {Host} host
 * @returns {{ left: number, top: number, right: number, bottom: number }[]}
 */
function layerBoxes(element, frame, host) {
  const view = viewOf(element.design, element.slots || {}, formatOf(frame));
  const placed = layoutView(view, {
    frame,
    unit: Math.min(frame.width, frame.height) / 100,
    measure: host.measure || estimateMeasure,
    sizeOf: host.sizeOf || (() => null),
    warn: () => {},
  });
  return view.layers.flatMap((layer) => {
    const where = placed.get(layer.id);
    if (!where) return [];
    // A generator layer paints the whole frame, whatever box it was given.
    const box =
      layer.type === 'generator' ? { x: 0, y: 0, w: frame.width, h: frame.height } : where.box;
    const left = Math.max(0, box.x);
    const top = Math.max(0, box.y);
    const right = Math.min(frame.width, box.x + box.w);
    const bottom = Math.min(frame.height, box.y + box.h);
    return right > left && bottom > top ? [{ left, top, right, bottom }] : [];
  });
}

/**
 * The rectangle around what an element shows at rest, inside the frame. A
 * layer that covers the frame behind an overlay's content — a scrim, a
 * footing gradient — is not counted while there is anything else: the box
 * goes around the words and their plate.
 * @param {{ design?: any, slots?: Record<string, string> }|null|undefined} element - A
 *   clip's `element` block
 * @param {Size} frame - Output size, pixels
 * @param {Host} [host] - A host's text measure and picture sizes; without
 *   them widths are estimated
 * @returns {Rect} The whole frame for a segment or a transition, and for a
 *   design that draws nothing or cannot be laid out
 */
export function elementBounds(element, frame, host = {}) {
  if (!(frame?.width > 0) || !(frame?.height > 0)) return { x: 0, y: 0, width: 0, height: 0 };
  if (!element?.design || element.design.kind !== 'overlay') return whole(frame);
  /** @type {ReturnType<typeof layerBoxes>} */
  let boxes;
  try {
    boxes = layerBoxes(/** @type {any} */ (element), frame, host);
  } catch (err) {
    console.warn('[brand] an element could not be laid out:', err?.message || err);
    return whole(frame);
  }
  const most = COVER * frame.width * frame.height;
  const content = boxes.filter((box) => (box.right - box.left) * (box.bottom - box.top) < most);
  if (!content.length) return whole(frame);
  const left = Math.min(...content.map((box) => box.left));
  const top = Math.min(...content.map((box) => box.top));
  const width = Math.max(MIN_SIDE, Math.max(...content.map((box) => box.right)) - left);
  const height = Math.max(MIN_SIDE, Math.max(...content.map((box) => box.bottom)) - top);
  return {
    x: Math.max(0, Math.min(left, frame.width - width)),
    y: Math.max(0, Math.min(top, frame.height - height)),
    width,
    height,
  };
}

/**
 * The part of the frame a small picture of an element shows: its bounds
 * with room around them, never closer than `closest` times — so a lower
 * third can be read on a tile and still sits visibly low in a frame. The
 * part has the frame's own shape, or the shape of the place the picture
 * goes (`aspect`): a wide tile then shows a band of a vertical frame.
 * @param {Rect} bounds - As `elementBounds` gives them
 * @param {Size} frame
 * @param {number} [closest=2.2] - The most the picture is enlarged
 * @param {number} [aspect] - Width over height of the part; default: the frame's
 * @returns {Rect} The whole frame for an element that fills most of it
 */
export function framing(bounds, frame, closest = 2.2, aspect = frame.width / frame.height) {
  const filled = (bounds.width * bounds.height) / (frame.width * frame.height);
  if (filled >= 0.8) return whole(frame);
  const room = 0.16 * Math.min(frame.width, frame.height);
  // The largest part of that shape the frame holds, then as much of it as the element needs.
  const most = { width: Math.min(frame.width, frame.height * aspect), height: 0 };
  most.height = most.width / aspect;
  const share = Math.max(
    (bounds.width + 2 * room) / most.width,
    (bounds.height + 2 * room) / most.height,
    1 / closest,
  );
  const same = Math.abs(aspect - frame.width / frame.height) < 1e-3;
  if (share >= 0.9 && same) return whole(frame);
  const width = most.width * Math.min(1, share);
  const height = most.height * Math.min(1, share);
  const x = bounds.x + bounds.width / 2 - width / 2;
  const y = bounds.y + bounds.height / 2 - height / 2;
  return {
    x: Math.max(0, Math.min(frame.width - width, x)),
    y: Math.max(0, Math.min(frame.height - height, y)),
    width,
    height,
  };
}
