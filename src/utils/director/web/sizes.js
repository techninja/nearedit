/**
 * The page a site demo records: its viewport, its pixel density and its
 * pointer, from the shape of the timeline it is made for — a wide frame
 * gets a desktop page, a tall one a phone, a square one a square desktop —
 * or from the size the editor chose. Reference:
 * docs/app-spec/DIRECTOR-WEB.md § The page. Isomorphic and pure.
 * @module utils/director/web/sizes
 */

import { RECIPE_LIMITS } from '#utils/web/limits.js';
import { WEB_SIZES, webSize } from '#utils/webUi/sizes.js';

/** The value of `size` that follows the timeline's shape. */
export const AUTO = 'auto';

/**
 * The page for each shape of frame: `[width, height, scale]`, CSS pixels.
 * A frame is `wide` from 6:5, `tall` up to 5:6, `square` in between.
 */
export const SHAPES = Object.freeze({
  wide: Object.freeze([1280, 720, 2]),
  tall: Object.freeze([390, 844, 3]),
  square: Object.freeze([960, 960, 2]),
});

/** A page narrower than this is used by touch: its pointer is a dot. */
const TOUCH_WIDTH = 900;

/** The choices of the `size` field: `[value, label]`. */
export const SIZE_CHOICES = Object.freeze([
  /** @type {[string, string]} */ ([AUTO, 'Auto — from the shape of the timeline']),
  ...WEB_SIZES.map(
    (size) =>
      /** @type {[string, string]} */ ([size.id, `${size.label} ${size.width} × ${size.height}`]),
  ),
]);

/**
 * @param {{ width: number, height: number }} format
 * @returns {'wide'|'tall'|'square'}
 */
export function frameShape(format) {
  const ratio = format.width / format.height;
  return ratio >= 1.2 ? 'wide' : ratio <= 1 / 1.2 ? 'tall' : 'square';
}

/**
 * The page to record.
 * @param {{ width: number, height: number }} format - The timeline's frame
 * @param {string} size - `auto` or the id of an offered size
 * @param {string} look - `window` or `full`
 * @returns {{ viewport: { width: number, height: number }, scale: number,
 *   cursor: { style: string, size: number }, why: string }} `why` says in
 *   words how the size was chosen
 */
export function demoView(format, size, look) {
  const chosen = webSize(size);
  const shape = frameShape(format);
  const [width, standard, scale] = chosen
    ? [chosen.width, chosen.height, chosen.scale]
    : SHAPES[shape];
  let height = standard;
  let why = chosen
    ? `${chosen.label} page, ${width} × ${height}, as chosen`
    : `a ${shape === 'tall' ? 'phone' : shape === 'wide' ? 'desktop' : 'square desktop'} page, ${width} × ${height}, for a ${shape} frame`;
  if (!chosen && look === 'full') {
    // Full frame: the page takes the frame's own shape, so nothing of it is cut off.
    const [min, max] = RECIPE_LIMITS.height;
    const exact = Math.round((width * format.height) / format.width / 2) * 2;
    height = Math.min(max, Math.max(min, exact));
    why = `a page ${width} × ${height}, the shape of the frame it fills`;
  }
  const touch = width < TOUCH_WIDTH;
  return {
    viewport: { width, height },
    scale,
    cursor: touch ? { style: 'dot', size: 1.4 } : { style: 'arrow', size: 1.4 },
    why,
  };
}
