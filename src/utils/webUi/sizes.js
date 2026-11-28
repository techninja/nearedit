/**
 * The page sizes a web clip is offered in: a recipe's `viewport` and the
 * `scale` that goes with it. A recipe with any other size is "Custom" and
 * keeps its numbers. Pure and isomorphic.
 * @module utils/webUi/sizes
 */

/** @typedef {import('#utils/web/types.js').Recipe} Recipe */

/**
 * @typedef {Object} WebSize
 * @property {string} id
 * @property {string} label
 * @property {number} width - CSS pixels
 * @property {number} height
 * @property {number} scale - Device pixels per CSS pixel
 * @property {string} icon - Name of an `<app-icon>`
 */

/** @type {readonly WebSize[]} */
export const WEB_SIZES = Object.freeze([
  { id: 'desktop', label: 'Desktop', width: 1280, height: 720, scale: 2, icon: 'monitor' },
  { id: 'wide', label: 'Wide', width: 1920, height: 1080, scale: 1, icon: 'maximize' },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1112, scale: 2, icon: 'tablet' },
  { id: 'phone', label: 'Phone', width: 390, height: 844, scale: 2, icon: 'mobile' },
]);

/** The size a new web clip starts with. */
export const DEFAULT_SIZE = 'desktop';

/**
 * @param {string} id
 * @returns {WebSize|undefined}
 */
export const webSize = (id) => WEB_SIZES.find((size) => size.id === id);

/**
 * @param {{ viewport?: { width: number, height: number } }} recipe
 * @returns {string} The id of the offered size the recipe has, or `custom`
 */
export function sizeIdOf(recipe) {
  const { width, height } = recipe?.viewport || {};
  return WEB_SIZES.find((size) => size.width === width && size.height === height)?.id || 'custom';
}

/**
 * @param {{ width: number, height: number }} size
 * @returns {string} `1280 × 720`
 */
export const sizeText = (size) => `${size.width} × ${size.height}`;

/**
 * The choices of a size dropdown: every offered size and, for a recipe
 * that has another one, that size as "Custom".
 * @param {{ viewport?: { width: number, height: number } }} [recipe]
 * @returns {[string, string][]} `[id, label]` pairs
 */
export function sizeChoices(recipe) {
  /** @type {[string, string][]} */
  const choices = WEB_SIZES.map((size) => [size.id, `${size.label} ${sizeText(size)}`]);
  if (recipe?.viewport && sizeIdOf(recipe) === 'custom')
    choices.push(['custom', `Custom ${sizeText(recipe.viewport)}`]);
  return choices;
}

/**
 * The part of a recipe a size sets.
 * @param {string} id
 * @returns {{ viewport: { width: number, height: number }, scale: number }|null}
 *   null for `custom` and anything unknown: the recipe keeps what it has
 */
export function sizePatch(id) {
  const size = webSize(id);
  return size ? { viewport: { width: size.width, height: size.height }, scale: size.scale } : null;
}

/**
 * The pixels of the recording a recipe makes: `viewport × scale`, each side
 * even (the encoder drops an odd last row or column).
 * @param {Recipe} recipe - Normalised
 * @returns {{ width: number, height: number }}
 */
export function recordingSize(recipe) {
  const even = (/** @type {number} */ side) => side - (side % 2);
  return {
    width: even(Math.round(recipe.viewport.width * recipe.scale)),
    height: even(Math.round(recipe.viewport.height * recipe.scale)),
  };
}
