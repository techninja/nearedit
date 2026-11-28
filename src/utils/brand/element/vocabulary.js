/**
 * The words of the element language: what a layer can be, where it can be
 * anchored, how it can arrive and leave. Data only — the reference of the
 * language is `index.js` in this folder. Isomorphic and pure.
 * @module utils/brand/element/vocabulary
 */

/** What an element is for (BRAND.md § Elements). */
export const KINDS = Object.freeze(['overlay', 'segment', 'transition']);

/** What a layer draws. */
export const LAYER_TYPES = Object.freeze(['text', 'shape', 'image', 'generator']);

/** Shapes of a `shape` layer: those of the shape generator. */
export const SHAPES = Object.freeze(['rectangle', 'ellipse', 'polygon', 'star', 'line']);

/**
 * Where a box is held: each anchor is a point of the box and the same point
 * of what it is placed in, as fractions `[x, y]`.
 * @type {Readonly<Record<string, readonly [number, number]>>}
 */
export const ANCHORS = Object.freeze({
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
});

/** The sides of a box something can be put beside. */
export const SIDES = Object.freeze(['left', 'right', 'top', 'bottom']);

/** Boxes every design has without defining them. */
export const FRAME_REFS = Object.freeze(['frame', 'safe']);

/**
 * How a layer arrives and leaves. `type` (type-on) and `blur` are text
 * motions: any other layer fades instead.
 */
export const MOTIONS = Object.freeze([
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'scale',
  'wipe',
  'type',
  'blur',
]);

/** The frame shapes a design can adjust itself for. */
export const FORMATS = Object.freeze(['wide', 'tall', 'square']);

/** How much longer one side must be for a frame to count as wide or tall. */
export const FORMAT_RATIO = 1.2;

/** Seconds a motion takes when a design does not say. */
export const MOTION_SECONDS = Object.freeze({ enter: 0.5, exit: 0.35 });

/** Units a sliding shape or picture travels when a design does not say. */
export const SLIDE_UNITS = 4;

/** Longest wait between two pieces of a text entrance, seconds. */
export const STAGGER = Object.freeze({ char: 0.04, word: 0.09, line: 0.16 });

/**
 * The format of a frame: `wide`, `tall` or `square`.
 * @param {{ width: number, height: number }} frame - Output size, pixels
 * @returns {'wide'|'tall'|'square'}
 */
export function formatOf(frame) {
  if (frame.width > frame.height * FORMAT_RATIO) return 'wide';
  return frame.height > frame.width * FORMAT_RATIO ? 'tall' : 'square';
}
