/**
 * From a theme to the page: the complete set of the app's colour custom
 * properties — one for each role, then the derived ones — and that set
 * written as a CSS rule. The names are the ones components have always
 * used. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § In the page.
 * @module utils/theme/variables
 */

import { DERIVED } from './derived.js';
import { ROLES } from './roles.js';

/** @typedef {import('./roles.js').Scheme} Scheme */

/** Every custom property a theme sets, in order. */
export const THEME_TOKENS = Object.freeze([
  ...ROLES.map((role) => role.token),
  ...DERIVED.map((derived) => derived.token),
]);

/**
 * @param {{ roles: Record<string, string>, scheme: Scheme }} theme - An
 *   effective theme: every role present (`effectiveTheme`)
 * @returns {Record<string, string>} Custom property → value, every one of
 *   `THEME_TOKENS`, in that order
 */
export function themeVariables(theme) {
  /** @type {Record<string, string>} */
  const variables = {};
  for (const role of ROLES) variables[role.token] = theme.roles[role.id];
  for (const derived of DERIVED) variables[derived.token] = derived.value(theme.roles, theme.scheme);
  return variables;
}

/**
 * `#aabbcc` as `#abc`, as the project's stylesheets write colours.
 * @param {string} value
 * @returns {string}
 */
function shortHex(value) {
  const m = /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/.exec(value);
  return m ? `#${m[1]}${m[2]}${m[3]}` : value;
}

/**
 * A theme as a CSS rule, formatted as the project's stylesheets are.
 * @param {Record<string, string>} variables - From `themeVariables`
 * @param {string} selector - e.g. `[data-theme='studio']`
 * @returns {string}
 */
export function themeRule(variables, selector) {
  const lines = Object.entries(variables).map(([token, value]) => `  ${token}: ${shortHex(value)};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}
