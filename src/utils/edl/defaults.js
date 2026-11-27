/**
 * EDL default value blocks (transform, ken burns, title text, generator) and
 * the enumerations of schema v3. Isomorphic: runs in the browser and in Node.
 * @module utils/edl/defaults
 */

export const EDL_VERSION = 3;

/** A document's `background`: an opaque hex colour. */
export const BACKGROUND_COLOR = /^#[0-9a-f]{6}$/i;

/** How a clip or a track combines with what is under it (COMPOSITOR.md). */
export const BLEND_MODES = [
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'soft-light',
];

/** Shapes of a fade; the formulas are in fadeCurves.js. */
export const FADE_CURVES = ['linear', 'smooth', 'fast', 'slow', 'sharp'];

/** `text.animateIn.type` / `text.animateOut.type`. */
export const TEXT_ANIMATIONS = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'scale',
  'blur',
  'typewriter',
];

/** `text.animateIn.by`: the unit a text animation is staggered over. */
export const TEXT_UNITS = ['block', 'line', 'word', 'char'];

/** @returns {object} Identity ken-burns block (disabled). */
export function defaultKenBurns() {
  return {
    enabled: false,
    startX: 0,
    startY: 0,
    startScale: 1,
    endX: 0,
    endY: 0,
    endScale: 1,
    startCropTop: 0,
    startCropBottom: 0,
    startCropLeft: 0,
    startCropRight: 0,
    endCropTop: 0,
    endCropBottom: 0,
    endCropLeft: 0,
    endCropRight: 0,
  };
}

/** @returns {object} Identity transform. */
export function defaultTransform() {
  return {
    fit: 'cover',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    kenBurns: defaultKenBurns(),
  };
}

/** @returns {object} A text animation that does nothing (`type: 'none'`). */
export function defaultTextAnimation() {
  return { type: 'none', duration: 0.5, by: 'block', stagger: 0.05, ease: 'ease-out' };
}

/**
 * @returns {object} Default title text block (empty content = not a title).
 *   The v3 additions default to what v2 drew: line height 1.2, a box padded
 *   by a quarter of the font size, no shadow, no animation.
 */
export function defaultText() {
  return {
    content: '',
    fontFamily: 'sans-serif',
    fontSize: 72,
    color: '#ffffff',
    background: '',
    align: 'center',
    bold: true,
    italic: false,
    outlineColor: '#000000',
    outlineWidth: 0,
    weight: 0,
    lineHeight: 1.2,
    letterSpacing: 0,
    maxWidth: 0,
    boxPadding: 0.25,
    boxRadius: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    animateIn: defaultTextAnimation(),
    animateOut: defaultTextAnimation(),
  };
}

/** @returns {object} The empty generator block (`type: ''` = not a generator). */
export function defaultGenerator() {
  return { type: '', seed: 0, params: {} };
}
