/**
 * Motion themes — named art directions for a piece made only of generated
 * layers: colours, a pairing of bundled fonts, and for every choice a scene
 * has to make, the options that suit the theme, its default first. The
 * planner takes what a plan leaves open from here, varied by a seed; the
 * builder takes colours and type from here. Adding a theme is adding an
 * entry to one of the data files.
 * Reference: docs/app-spec/DIRECTOR-MOTION.md § Themes.
 * Isomorphic and pure.
 * @module utils/director/motion/themes
 */

import { hash, seedOf } from '#utils/compose/random.js';
import { DAY_THEMES } from './themesDay.js';
import { NIGHT_THEMES } from './themesNight.js';

/**
 * @typedef {Object} ThemeFont
 * @property {string} fontFamily - A bundled family
 * @property {number} weight
 * @property {boolean} [italic]
 * @property {number} size - Largest font size, as a share of the frame's shorter side
 * @property {number} [lineHeight] - Multiple of the font size
 * @property {number} [tracking] - Letter spacing as a share of the font size
 * @property {string} [animation] - Subtitle only: the text animation it arrives with
 */

/**
 * @typedef {Object} Theme
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} ink - Title colour
 * @property {string} sub - Subtitle colour
 * @property {string} accent - Colour of rules, frames and rings
 * @property {[string, string, string][]} backdrops - Colour ways for the
 *   backgrounds, each from the colour of the edges to the colour of the light.
 *   `ink` and `sub` are readable on every one of them
 * @property {boolean} shadow - Give the text a soft shadow in the deepest colour
 * @property {ThemeFont} title
 * @property {ThemeFont} subtitle
 * @property {string[]} backgrounds - Background recipes, the default first
 * @property {string[]} particles - Particle presets (or `none`), the default first
 * @property {[string, string][]} animations - `[textAnimation, by]`, the default first
 * @property {string[]} accents - The default first
 * @property {string[]} transitions - The default first
 * @property {string} look - Effect preset every scene gets, or `none`
 */

/** @type {Theme[]} In the order the form lists them. */
export const THEMES = [
  NIGHT_THEMES[0],
  DAY_THEMES[0],
  DAY_THEMES[1],
  NIGHT_THEMES[1],
  NIGHT_THEMES[2],
  DAY_THEMES[2],
  DAY_THEMES[3],
  NIGHT_THEMES[3],
];

/** The value of `theme` that lets the seed choose. */
export const AUTO = 'auto';

/** @returns {string[]} Theme ids */
export const themeIds = () => THEMES.map((theme) => theme.id);

/**
 * @param {unknown} id
 * @returns {Theme|undefined}
 */
export const getTheme = (id) => THEMES.find((theme) => theme.id === String(id ?? '').toLowerCase());

/**
 * The theme of a piece: the named one, or the seed's choice. Whole-number
 * seeds walk through the themes in order (1 is the first), so the next
 * number always gives another theme; any other seed is hashed.
 * @param {unknown} id - A theme id, `auto` or nothing
 * @param {number|string} seed
 * @returns {Theme}
 */
export function pickTheme(id, seed) {
  const named = getTheme(id);
  if (named) return named;
  const whole = typeof seed === 'number' && Number.isInteger(seed);
  const turn = whole ? Math.abs(seed) + THEMES.length - 1 : seedOf(seed);
  return THEMES[turn % THEMES.length];
}

/**
 * The seed's choice from a list, stable for a seed and a purpose.
 * @template T
 * @param {T[]} list - Not empty
 * @param {number|string} seed
 * @param {number} salt - What is being chosen
 * @param {number} [step=0] - Walk on through the list (scene after scene)
 * @returns {T}
 */
export function choose(list, seed, salt, step = 0) {
  return list[(hash(seedOf(seed), salt) + step) % list.length];
}
