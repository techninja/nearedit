/**
 * A theme as a Design Tokens file — the form a theme is stored in and
 * exchanged in (W3C Design Tokens Community Group, format and colour
 * modules 2025.10): one colour token a role, grouped as `interface`,
 * `status`, `timeline` and `clip`; the theme's name, scheme and the theme
 * it extends under `$extensions.nearedit`. Reading takes what the format
 * allows: any of its colour spaces, references, groups that extend groups.
 * Isomorphic and pure. Contract: docs/app-spec/THEMES.md § The file.
 * @module utils/theme/designTokens
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { ROLES, ROLE_GROUPS, groupOf, roleAt } from './roles.js';
import { readColor, tokenColor } from './tokens/color.js';
import { readDocument } from './tokens/document.js';

/** @typedef {import('./model.js').Theme} Theme */
/** @typedef {import('./model.js').Problem} Problem */

/** The key of NearEdit's own data in a file's `$extensions`. */
export const VENDOR = 'nearedit';
/** The media type of a Design Tokens file (format § 4.1). */
export const TOKENS_TYPE = 'application/design-tokens+json';
/** How a theme file is named: `<id>.tokens.json` (format § 4.2). */
export const TOKENS_SUFFIX = '.tokens.json';
/** Tokens that are not roles are named one by one up to this many. */
const MAX_STRANGERS = 8;

/**
 * Write a theme as a Design Tokens document.
 * @param {Theme} theme - Normalised; only the roles it sets are written
 * @returns {Record<string, any>}
 */
export function toDesignTokens(theme) {
  const meta = { name: theme.name, scheme: theme.scheme, extends: theme.extends };
  /** @type {Record<string, any>} */
  const doc = {
    ...(theme.description ? { $description: theme.description } : {}),
    $extensions: {
      [VENDOR]: Object.fromEntries(Object.entries(meta).filter(([, value]) => value)),
    },
  };
  for (const { id } of ROLE_GROUPS) {
    const roles = ROLES.filter((role) => groupOf(role) === id && theme.roles[role.id]);
    if (!roles.length) continue;
    doc[id] = { $type: 'color' };
    for (const role of roles) {
      doc[id][role.path.split('.')[1]] = { $value: tokenColor(theme.roles[role.id]) };
    }
  }
  return doc;
}

/**
 * Read a theme out of a Design Tokens document.
 * @param {unknown} doc - Parsed JSON
 * @returns {{ theme: Omit<Theme, 'id'>, problems: Problem[] }} What the file
 *   gives of a theme (validate it with `validateTheme`), and what is wrong
 *   with the file as a Design Tokens file; problem paths are token paths
 */
export function fromDesignTokens(doc) {
  const { tokens, problems: found } = readDocument(doc);
  /** @type {Problem[]} */
  const problems = found.map((problem) => ({ ...problem, level: 'error' }));
  /** @type {Record<string, string>} */
  const roles = {};
  const strangers = [];
  for (const token of tokens) {
    const role = roleAt(token.path);
    const report = (/** @type {string} */ message, level = 'error') =>
      void problems.push({ path: token.path, message, level: /** @type {any} */ (level) });
    if (!role) strangers.push(token.path);
    else if (token.type !== 'color') {
      report(token.type ? `has the type "${token.type}"; a role is a color` : 'has no $type');
    } else if (token.value !== undefined) {
      const { color, problem, note } = readColor(token.value);
      if (color) roles[role.id] = color;
      if (problem) report(problem);
      if (note) report(note, 'warning');
    }
  }
  if (strangers.length) {
    const named = strangers.slice(0, MAX_STRANGERS).join(', ');
    const more = strangers.length > MAX_STRANGERS ? ` and ${strangers.length - MAX_STRANGERS} more` : '';
    const message = `${named}${more}: not a role of a theme, left as it is`;
    problems.push({ path: '', message, level: 'warning' });
  }
  const root = isPlainObject(doc) ? /** @type {Record<string, any>} */ (doc) : {};
  const own = isPlainObject(root.$extensions?.[VENDOR]) ? root.$extensions[VENDOR] : {};
  const text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value : '');
  const theme = {
    name: text(own.name),
    description: text(root.$description),
    scheme: own.scheme,
    extends: text(own.extends),
    roles,
  };
  return { theme, problems };
}
