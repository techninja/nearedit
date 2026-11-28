/**
 * From a theme as it is written to the theme as it is shown: the roles of
 * the themes it extends are laid under its own, and what none of them gives
 * is found by rule. A chain that cannot be followed — a theme that is not
 * there, a loop, too many themes — is cut where it breaks, with a problem
 * that says so. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § A theme.
 * @module utils/theme/resolve
 */

import { luminance } from '#utils/brand/color.js';
import { builtinTheme } from './builtin/index.js';
import { THEME_LIMITS, normalizeTheme } from './model.js';
import { REQUIRED_ROLES, completeRoles } from './roles.js';

/** @typedef {import('./model.js').Theme} Theme */
/** @typedef {import('./model.js').Problem} Problem */
/** @typedef {import('./roles.js').Scheme} Scheme */

/**
 * A theme with nothing left open.
 * @typedef {Object} EffectiveTheme
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Scheme} scheme
 * @property {Record<string, string>} roles - Every role
 * @property {Record<string, string>} given - The roles the theme and the
 *   themes it extends set; the others were found by rule
 * @property {string[]} chain - Ids: the theme, then what it extends
 * @property {Problem[]} problems - What had to be cut or stood in for
 */

/**
 * @param {Record<string, string>} roles
 * @returns {Scheme} What a theme without a scheme most likely is
 */
function guessScheme(roles) {
  if (!roles.bg) return 'dark';
  return luminance(roles.bg) > luminance(roles.text || '#808080') ? 'light' : 'dark';
}

/**
 * Resolve a theme through the themes it extends.
 * @param {Theme} theme - Normalised (`normalizeTheme`)
 * @param {(id: string) => unknown} [find] - Where the themes it names are
 *   looked for; the built-in themes by default
 * @returns {EffectiveTheme}
 */
export function effectiveTheme(theme, find = builtinTheme) {
  /** @type {Problem[]} */
  const problems = [];
  const chain = [theme];
  const seen = new Set([theme.id]);
  for (let at = theme; at.extends; at = chain[chain.length - 1]) {
    const found = find(at.extends);
    let why = found ? '' : `extends "${at.extends}", which was not found`;
    if (found && seen.has(at.extends)) why = `extends itself by way of "${at.extends}"`;
    else if (found && chain.length >= THEME_LIMITS.depth) {
      why = `has more than ${THEME_LIMITS.depth} themes in its chain`;
    }
    if (why) {
      const message = `Theme "${at.id}" ${why}: what it leaves open is found by rule`;
      problems.push({ path: 'extends', message, level: 'error' });
      break;
    }
    seen.add(at.extends);
    chain.push(normalizeTheme(found, at.extends));
  }
  /** @type {Record<string, string>} */
  const given = Object.assign({}, ...chain.map((link) => link.roles).reverse());
  const stated = chain.find((link) => link.scheme)?.scheme;
  if (!stated) problems.push({ path: 'scheme', message: 'is required: light or dark', level: 'error' });
  for (const id of REQUIRED_ROLES) {
    if (!given[id]) problems.push({ path: `roles.${id}`, message: 'is required', level: 'error' });
  }
  const scheme = stated || guessScheme(given);
  return {
    ...{ id: theme.id, name: theme.name || theme.id, description: theme.description, scheme },
    roles: completeRoles(given, scheme),
    given,
    chain: chain.map((link) => link.id),
    problems,
  };
}
