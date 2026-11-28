/**
 * What must read on what, as data: text on its grounds, quiet text, clip
 * labels on every clip colour, the focus ring against its ground — with the
 * WCAG 2 AA numbers (4.5:1 for text, 3:1 for a ring or a line). `measure`
 * applies the list to a theme; validation and the docs' tables both use it.
 * Isomorphic and pure. Contract: docs/app-spec/THEMES.md § Contrast.
 * @module utils/theme/contrast
 */

import { contrastRatio } from '#utils/brand/color.js';
import { roleOf } from './roles.js';
import { CLIP_ROLE_IDS } from './rolesTimeline.js';

/** Contrast text needs (WCAG 2 AA). */
export const TEXT_CONTRAST = 4.5;
/** Contrast a ring, a line or an icon needs (WCAG 2 AA, non-text). */
export const MARK_CONTRAST = 3;

/**
 * One thing that must read on some grounds.
 * @typedef {Object} ContrastRule
 * @property {string} ink - A role id
 * @property {string[]} grounds - Role ids
 * @property {number} least - The ratio wanted
 * @property {string} what - What is drawn in the ink
 */

const PAGE = ['bg', 'surface'];
/** @type {(ink: string, what: string) => ContrastRule} */
const status = (ink, what) => ({ ink, grounds: PAGE, least: TEXT_CONTRAST, what });

/** @type {ReadonlyArray<ContrastRule>} */
export const CONTRAST_RULES = Object.freeze([
  {
    ...{ ink: 'text', grounds: [...PAGE, 'surface2', 'surface3', 'ruler'] },
    ...{ least: TEXT_CONTRAST, what: 'Text' },
  },
  {
    ...{ ink: 'muted', grounds: [...PAGE, 'surface2', 'ruler'] },
    ...{ least: TEXT_CONTRAST, what: 'Quiet text' },
  },
  { ink: 'accent', grounds: PAGE, least: TEXT_CONTRAST, what: 'Links and plain buttons' },
  { ink: 'accent', grounds: ['surface3'], least: MARK_CONTRAST, what: 'The icon of a chosen tool' },
  {
    ...{ ink: 'onAccent', grounds: ['accent', 'danger', 'warning'] },
    ...{ least: TEXT_CONTRAST, what: 'Letters on a filled button' },
  },
  { ink: 'focus', grounds: PAGE, least: MARK_CONTRAST, what: 'The focus ring' },
  status('danger', 'Error text'),
  status('warning', 'Warning text'),
  status('success', 'Success text'),
  status('info', 'Notes'),
  {
    ...{ ink: 'clipText', grounds: [...CLIP_ROLE_IDS, 'marker'] },
    ...{ least: TEXT_CONTRAST, what: 'Clip labels' },
  },
  {
    ...{ ink: 'playhead', grounds: ['lane', 'laneAlt', 'ruler'] },
    ...{ least: MARK_CONTRAST, what: 'The playhead' },
  },
  { ink: 'cursor', grounds: ['lane', 'laneAlt'], least: MARK_CONTRAST, what: 'The edit cursor' },
]);

/**
 * One measured pair.
 * @typedef {Object} Measured
 * @property {string} ink - Role id
 * @property {string} ground - Role id
 * @property {string} what
 * @property {number} ratio - As measured, two decimals
 * @property {number} least
 * @property {boolean} pass
 */

/**
 * Measure every pair of `CONTRAST_RULES` in a theme.
 * @param {Record<string, string>} roles - Every role (`effectiveTheme().roles`)
 * @returns {Measured[]}
 */
export function measure(roles) {
  return CONTRAST_RULES.flatMap(({ ink, grounds, least, what }) =>
    grounds.map((ground) => {
      const ratio = Math.floor(contrastRatio(roles[ink], roles[ground]) * 100) / 100;
      return { ink, ground, what, ratio, least, pass: ratio >= least };
    }),
  );
}

/**
 * @param {Measured} pair - One that does not pass
 * @param {Record<string, string>} roles
 * @returns {string} What to tell the theme's author
 */
export function contrastMessage(pair, roles) {
  const ground = roleOf(pair.ground);
  return (
    `${pair.what}: ${roles[pair.ink]} reads at ${pair.ratio.toFixed(2)}:1 on ` +
    `${ground.label.toLowerCase()} (${pair.ground} ${roles[pair.ground]}); ` +
    `${pair.least}:1 is wanted`
  );
}
