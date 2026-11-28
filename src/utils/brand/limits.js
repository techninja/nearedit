/**
 * The bounds of a brand kit, as data: how long a chain may be, how many
 * elements, layers and slots a kit may hold, how long a text may be. Every
 * reader of a kit or of a clip's `element` block cuts what it reads to
 * these, so nothing loaded from a file can grow without limit.
 * Isomorphic and pure.
 * @module utils/brand/limits
 */

/** Everything a kit is bounded by. Lengths are characters. */
export const LIMITS = Object.freeze({
  /** Kits in a chain, the built-in root included. */
  depth: 5,
  /** Elements of one kit. */
  elements: 64,
  /** Layers of one element. */
  layers: 48,
  /** Groups of one element. */
  groups: 16,
  /** Slots of one element. */
  slots: 12,
  /** Entries of a kit's or a document's font table. */
  fonts: 32,
  /** Entries of a kit's `defaults`. */
  defaults: 24,
  /** Kit and element ids, layer, group and slot names. */
  id: 40,
  /** Names and labels. */
  name: 80,
  /** A font family's name. */
  family: 80,
  /** A file path. */
  path: 1024,
  /** What is filled into one slot. */
  slotText: 2000,
  /** A text written into a design. */
  text: 400,
  /** Seconds an element may ask for as its length. */
  duration: Object.freeze([0.2, 600]),
});

/** What an id looks like: a kit, an element, a layer, a group, a slot. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/**
 * @param {unknown} value
 * @returns {boolean} True for a string that can name a kit, an element, a
 *   layer, a group or a slot
 */
export const isId = (value) => typeof value === 'string' && ID_PATTERN.test(value);

/** The prefix that names a built-in kit in `extends`. */
export const BUILTIN_PREFIX = 'builtin:';

/** The built-in kit a chain rests on when it names none. */
export const DEFAULT_KIT = 'clean';

/**
 * Version of the element language. It is part of every kit's key: raise it
 * when the same design is laid out or animated differently, and every
 * element clip counts as out of date.
 */
export const BRAND_VERSION = 1;
