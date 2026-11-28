/**
 * What follows from a theme's roles and is never written by hand: hovered
 * fills, the scrim behind a dialog, shadows, the tint of the loop region,
 * the halo of a focused field, the pill that carries a badge on a clip.
 * Each is data — the CSS custom property, a label, the rule in words and as
 * a function — so the list documents itself. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § Derived.
 * @module utils/theme/derived
 */

import { luminance, readableOn } from '#utils/brand/color.js';
import { hovered, mix, translucent } from './color.js';

/** @typedef {import('./roles.js').Scheme} Scheme */

/**
 * One derived value.
 * @typedef {Object} Derived
 * @property {string} token - The CSS custom property
 * @property {string} label
 * @property {string} rule - In words
 * @property {(roles: Record<string, string>, scheme: Scheme) => string} value
 */

/** @type {(role: string, token: string, label: string) => Derived} */
const hover = (role, token, label) => ({
  token,
  label: `${label}, hovered`,
  rule: `The ${label.toLowerCase()} a step away from the ground: lighter in a dark theme, darker in a light one`,
  value: (roles, scheme) => hovered(roles[role], scheme),
});

/** @param {Record<string, string>} roles @returns {boolean} True when clip labels are light */
const lightInk = (roles) => luminance(roles.clipText) > 0.4;

/** Every derived value, in the order the stylesheet lists them. @type {ReadonlyArray<Derived>} */
export const DERIVED = Object.freeze([
  hover('accent', '--color-primary-hover', 'Accent'),
  hover('success', '--color-success-hover', 'Success'),
  hover('warning', '--color-warning-hover', 'Warning'),
  hover('danger', '--color-danger-hover', 'Danger'),
  hover('info', '--color-info-hover', 'Info'),
  {
    token: '--color-overlay',
    label: 'Scrim',
    rule: 'Behind a dialog: the ground darkened at 65% in a dark theme, the text darkened at 45% in a light one',
    value: (roles, scheme) =>
      scheme === 'dark'
        ? translucent(mix(roles.bg, '#000000', 0.6), 65)
        : translucent(mix(roles.text, '#000000', 0.3), 45),
  },
  {
    token: '--shadow-sm',
    label: 'Small shadow',
    rule: 'Black at 30% in a dark theme, 5% in a light one',
    value: (_roles, scheme) => `0 1px 2px rgb(0 0 0 / ${scheme === 'dark' ? 30 : 5}%)`,
  },
  {
    token: '--shadow-md',
    label: 'Shadow',
    rule: 'Under dialogs, menus and the picture: black at 40% in a dark theme, 7% in a light one',
    value: (_roles, scheme) => `0 4px 6px rgb(0 0 0 / ${scheme === 'dark' ? 40 : 7}%)`,
  },
  {
    token: '--color-loop',
    label: 'Loop region',
    rule: 'The focus colour at 20%',
    value: (roles) => translucent(roles.focus, 20),
  },
  {
    token: '--color-focus-halo',
    label: 'Focus halo',
    rule: 'Around a focused field: the focus colour at 25%',
    value: (roles) => translucent(roles.focus, 25),
  },
  {
    token: '--color-clip-shade',
    label: 'Badge on a clip',
    rule: 'The pill under a badge drawn in the clip label colour: black at 55% under light labels, white at 65% under dark ones',
    value: (roles) => (lightInk(roles) ? 'rgb(0 0 0 / 55%)' : 'rgb(255 255 255 / 65%)'),
  },
  {
    token: '--color-clip-text-inverse',
    label: 'Letters on a clip-label fill',
    rule: 'Black or white, whichever reads on the clip label colour',
    value: (roles) => readableOn(roles.clipText),
  },
]);
