/**
 * What is wrong with a theme, for the person who wrote it: every problem
 * with the path of what it concerns — a field a theme does not have, a
 * value that is not a colour, a role nobody gave, text that does not read
 * on its ground. Contrast is a warning in anyone's theme and an error in a
 * built-in one (`strict`). Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § Validation.
 * @module utils/theme/validate
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { cleanColor } from './color.js';
import { contrastMessage, measure } from './contrast.js';
import { RESERVED_IDS, THEME_ID, THEME_LIMITS, isScheme, isThemeId, normalizeTheme } from './model.js';
import { effectiveTheme } from './resolve.js';
import { roleOf } from './roles.js';

/** @typedef {import('./model.js').Problem} Problem */

const FIELDS = ['id', 'name', 'description', 'scheme', 'extends', 'roles'];
const ID_RULE = 'lower-case letters, digits, - and _, at most 40, starting with a letter or a digit';

/**
 * @param {unknown} id
 * @returns {string} What is wrong with it as a theme's id; '' when nothing is
 */
export function idProblem(id) {
  if (RESERVED_IDS.includes(/** @type {any} */ (id))) return `"${id}" names a preference, not a theme`;
  return typeof id === 'string' && THEME_ID.test(id) ? '' : `must be ${ID_RULE}`;
}

/**
 * What is wrong with a theme's fields as they were written — before
 * anything is resolved or measured.
 * @param {unknown} written
 * @returns {Problem[]}
 */
export function fieldProblems(written) {
  /** @type {Problem[]} */
  const problems = [];
  /** @type {(path: string, message: string, level?: Problem['level']) => void} */
  const report = (path, message, level = 'error') => void problems.push({ path, message, level });
  if (!isPlainObject(written)) return (report('', 'a theme must be an object'), problems);
  const theme = /** @type {Record<string, any>} */ (written);
  for (const key of Object.keys(theme).filter((name) => !FIELDS.includes(name))) {
    report(key, 'is not a field of a theme', 'warning');
  }
  if (theme.id !== undefined && idProblem(theme.id)) report('id', idProblem(theme.id));
  for (const field of /** @type {const} */ (['name', 'description'])) {
    if (theme[field] !== undefined && typeof theme[field] !== 'string') report(field, 'must be text');
    else if ((theme[field] || '').length > THEME_LIMITS[field]) report(field, 'is too long', 'warning');
  }
  if (theme.scheme !== undefined && theme.scheme !== '' && !isScheme(theme.scheme)) {
    report('scheme', 'must be light or dark');
  }
  if (theme.extends !== undefined && theme.extends !== '' && !isThemeId(theme.extends)) {
    report('extends', "must be another theme's id");
  }
  if (theme.roles !== undefined && !isPlainObject(theme.roles)) report('roles', 'must be an object');
  for (const [name, value] of Object.entries(isPlainObject(theme.roles) ? theme.roles : {})) {
    if (!roleOf(name)) report(`roles.${name}`, 'is not a role', 'warning');
    else if (!cleanColor(value)) report(`roles.${name}`, 'must be a colour: #rgb or #rrggbb');
  }
  return problems;
}

/**
 * Validate a theme as it was written.
 * @param {unknown} theme - `{ id, name, scheme, extends, roles }`
 * @param {{ find?: (id: string) => unknown, strict?: boolean }} [opts] - `find`:
 *   where the themes it extends are looked for (the built-in ones by
 *   default); `strict`: contrast below AA is an error, not a warning
 * @returns {{ valid: boolean, problems: Problem[],
 *   effective: import('./resolve.js').EffectiveTheme }} `valid` is false when
 *   a problem is an error; `effective` is the theme as it would show
 */
export function validateTheme(theme, opts = {}) {
  const effective = effectiveTheme(normalizeTheme(theme), opts.find);
  const problems = [...fieldProblems(theme), ...effective.problems];
  // Contrast is measured on colours that are there: a theme with holes has other problems first.
  if (!effective.problems.some((problem) => problem.path.startsWith('roles.'))) {
    for (const pair of measure(effective.roles).filter((measured) => !measured.pass)) {
      const message = contrastMessage(pair, effective.roles);
      problems.push({ path: `roles.${pair.ink}`, message, level: opts.strict ? 'error' : 'warning' });
    }
  }
  return { valid: !problems.some((problem) => problem.level === 'error'), problems, effective };
}
