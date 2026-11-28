/**
 * Where an element's picture is inside its frame: the rectangle around
 * every layer of its design, laid out for a frame with what is filled in —
 * the element **at rest**, its motions over. It is the brand model's own
 * layout (`layoutView`), so it is where the compositor draws. The preview's
 * box and handles go around it (a lower third is grabbed by its plate, not
 * by the whole frame), a tile of the Create tab is framed on it, and the
 * compositor's caption pass keeps captions clear of it. Pure and isomorphic.
 * @module utils/brand/element/bounds
 */

import { layoutView } from './layout.js';
import { estimateMeasure } from './measure.js';
import { viewOf } from './view.js';
import { formatOf } from './vocabulary.js';

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
