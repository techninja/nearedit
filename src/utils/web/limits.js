/**
 * The bounds of a recipe and its defaults. Isomorphic and pure.
 * @module utils/web/limits
 */

/** @typedef {import('./types.js').Recipe} Recipe */

/**
 * Everything a recipe is bounded by. Lengths are characters, times seconds,
 * `[min, max]` pairs are inclusive.
 */
export const RECIPE_LIMITS = Object.freeze({
  steps: 200,
  url: 2000,
  text: 2000,
  js: 5000,
  target: 500,
  note: 500,
  key: 50,
  storage: 1000,
  hide: 50,
  /** Longest `lead`, `tail`, `duration` or `hold`. */
  seconds: 120,
  /** Longest recording (WEBCLIP.md § What the browser may load). */
  duration: 600,
  width: Object.freeze([320, 3840]),
  height: Object.freeze([240, 2160]),
  scale: Object.freeze([1, 3]),
  cursorSize: Object.freeze([0.25, 4]),
  /** A point target, CSS pixels. */
  point: Object.freeze([-100000, 100000]),
});

/** How the drawn pointer looks; `arrow` becomes a hand over links and buttons. */
export const CURSOR_STYLES = Object.freeze(['arrow', 'dot', 'none']);

/**
 * `prefers-color-scheme` of the page.
 * @type {ReadonlyArray<'light'|'dark'>}
 */
export const COLOR_SCHEMES = Object.freeze(['light', 'dark']);

/**
 * What a step does when its target is not on the page.
 * @type {ReadonlyArray<'fail'|'skip'>}
 */
export const ON_MISSING = Object.freeze(['fail', 'skip']);

/** Easing of a step's motion unless it names another. */
export const DEFAULT_EASE = 'ease-in-out';

/**
 * @returns {Recipe} A complete recipe with no address and no steps
 */
export function defaultRecipe() {
  return {
    url: '',
    viewport: { width: 1280, height: 720 },
    scale: 2,
    colorScheme: 'light',
    lead: 0.6,
    tail: 1,
    cursor: { style: 'arrow', size: 1, color: '#111827', clicks: true },
    hide: [],
    storage: '',
    onMissing: 'fail',
    steps: [],
  };
}
