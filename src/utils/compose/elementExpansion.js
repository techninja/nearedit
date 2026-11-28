/**
 * The expansion of an element clip, kept between frames. Expanding lays
 * text out, which is the costly part; its result depends only on the
 * clip's `element` block, its length, the output size, the font table and
 * the sizes of the pictures it shows — so it is remembered per block (a
 * document is never changed in place: the same block is the same element)
 * and laid out again only when one of those changes. Nothing else is kept
 * from one frame to the next. Isomorphic.
 * @module utils/compose/elementExpansion
 */

import { expandElement } from '#utils/brand/element/expand.js';
import { elementNeeds } from '#utils/brand/element/needs.js';
import { formatOf } from '#utils/brand/element/vocabulary.js';
import { fontString } from './fonts.js';
import { pictureSize, warnOnce } from './host.js';
import { layerKind } from './layers.js';
import { setFont } from './text/draw.js';

/**
 * One expanded layer, ready to draw.
 * @typedef {Object} ElementLayer
 * @property {any} clip
 * @property {{ type: 'video', clips: any[] }} lane - A track of its own: the
 *   layers of an element never cross-fade with each other
 * @property {import('./layers.js').LayerKind} kind
 */

/** Expansions kept per element block: a trim tries many lengths in a row. */
const MAX_KEPT = 4;
/** @type {ElementLayer[]} */
const NOTHING = [];
/** @type {WeakMap<object, Map<string, { layers: ElementLayer[], fonts: any }>>} */
const kept = new WeakMap();

/**
 * @param {any} element - A clip's `element` block
 * @param {import('./drawClip.js').FrameRun} run
 * @returns {string[]} The paths of the pictures it shows in this frame's format
 */
function picturesOf(element, run) {
  const { frame } = run;
  return elementNeeds(element, formatOf({ width: frame.outWidth, height: frame.outHeight })).images;
}

/**
 * @param {any} element
 * @param {import('./drawClip.js').FrameRun} run
 * @returns {boolean} True for an element whose layout waits for a picture's size
 */
export const showsPictures = (element, run) => picturesOf(element, run).length > 0;

/**
 * What laying an element out depends on beside its block and the output
 * size: the sizes of the pictures it shows, as this host has them now.
 * @param {any} element
 * @param {import('./drawClip.js').FrameRun} run
 * @returns {string} One size per picture; empty for one that has not arrived
 */
export function pictureSizes(element, run) {
  return picturesOf(element, run)
    .map((path) => {
      const picture = pictureSize(run.compose.env.image(path));
      return picture.width > 0 ? `${picture.width}x${picture.height}` : '';
    })
    .join(',');
}

/**
 * Whether every font an element's text is set in has arrived: a layout
 * measured with a fallback font would stay wrong.
 * @param {any} element
 * @param {import('./drawClip.js').FrameRun} run
 * @returns {boolean}
 */
export function fontsReady(element, run) {
  const { frame } = run;
  const format = formatOf({ width: frame.outWidth, height: frame.outHeight });
  return elementNeeds(element, format).texts.every((text) =>
    run.compose.env.fontReady(
      fontString({ ...text, fontSize: 72, fonts: frame.fonts }, 1),
      text.text,
    ),
  );
}

/**
 * How this host measures for an element's layout: text with the canvas's
 * own fonts, pictures by the size they were decoded at.
 * @param {import('./drawClip.js').FrameRun} run
 * @param {any} ctx - Any context of this host
 * @returns {{ measure: (text: string, style: any) => number,
 *   sizeOf: (path: string) => { width: number, height: number }|null }}
 */
export function layoutHost(run, ctx) {
  const { frame } = run;
  return {
    measure(text, style) {
      ctx.save();
      setFont(ctx, /** @type {any} */ ({ ...style, fonts: frame.fonts }));
      const { width } = ctx.measureText(text);
      ctx.restore();
      return width;
    },
    sizeOf(path) {
      const picture = pictureSize(run.compose.env.image(path));
      return picture.width > 0 && picture.height > 0 ? picture : null;
    },
  };
}

/**
 * The layers of an element clip for a length and this frame, back to front.
 * @param {any} element - The clip's `element` block
 * @param {number} duration - Seconds the element plays for (its run)
 * @param {import('./drawClip.js').FrameRun} run
 * @param {any} ctx - Any context of this host, to measure text with
 * @returns {ElementLayer[]} Empty while a font is still loading, and for a
 *   design that cannot be expanded
 */
export function expansionOf(element, duration, run, ctx) {
  const { frame } = run;
  const size = { width: frame.outWidth, height: frame.outHeight };
  const key = `${duration.toFixed(6)}|${size.width}x${size.height}|${pictureSizes(element, run)}`;
  let known = kept.get(element);
  const found = known?.get(key);
  if (found && found.fonts === frame.fonts) return found.layers;
  if (!fontsReady(element, run)) return NOTHING;
  const clips = expandElement(element.design, element.slots, {
    duration,
    frame: size,
    ...layoutHost(run, ctx),
    warn: (message) => warnOnce(`element:${message}`, message),
  });
  /** @type {ElementLayer[]} */
  const layers = [];
  for (const clip of clips) {
    /** @type {ElementLayer['lane']} */
    const lane = { type: 'video', clips: [clip] };
    const kind = layerKind(clip, lane);
    if (kind && kind !== 'element') layers.push({ clip, lane, kind });
  }
  if (!known) kept.set(element, (known = new Map()));
  if (known.size >= MAX_KEPT) known.delete(known.keys().next().value);
  known.set(key, { layers, fonts: frame.fonts });
  return layers;
}
