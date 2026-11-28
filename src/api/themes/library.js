/**
 * The theme library — one Design Tokens file a theme under `<data>/themes/`
 * — together with the built-in themes, which are listed and read the same
 * way and cannot be written. Whatever a file holds, it is listed: a broken
 * one comes with its problems. Contract: docs/app-spec/THEMES.md § Routes.
 * @module api/themes/library
 */

import { BUILTIN_THEMES, builtinTheme } from '#utils/theme/builtin/index.js';
import { fromDesignTokens, toDesignTokens } from '#utils/theme/designTokens.js';
import { isThemeId, normalizeTheme } from '#utils/theme/model.js';
import { validateTheme } from '#utils/theme/validate.js';
import { themeVariables } from '#utils/theme/variables.js';
import { HttpError } from '../lib/httpErrors.js';
import { libraryIds, readThemeFile, removeThemeFile } from './files.js';
import { MAX_THEMES, SWATCHES } from './limits.js';

/** @typedef {import('#utils/theme/model.js').Theme} Theme */
/** @typedef {import('#utils/theme/model.js').Problem} Problem */

/**
 * A theme as it was opened.
 * @typedef {Object} Opened
 * @property {string} id
 * @property {'builtin'|'library'} source
 * @property {Record<string, any>} written - The theme as its file gives it, before it is cleaned
 * @property {unknown} tokens - Its Design Tokens document
 * @property {Problem[]} problems - What is wrong with the file as a file
 */

/** @type {Map<string, { stamp: string, opened: Opened }>} */
const cache = new Map();

/**
 * Read a Design Tokens document as a theme.
 * @param {string} id
 * @param {unknown} tokens
 * @param {Problem[]} [problems] - What is already known to be wrong
 * @returns {Opened}
 */
export function openTokens(id, tokens, problems = []) {
  const read = fromDesignTokens(tokens);
  const written = { ...read.theme, id };
  return { id, source: 'library', written, tokens, problems: [...problems, ...read.problems] };
}

/**
 * @param {unknown} id
 * @returns {Opened|null} null when there is no such theme
 */
export function openTheme(id) {
  const builtin = builtinTheme(id);
  if (builtin) {
    const tokens = toDesignTokens(normalizeTheme(builtin));
    return { id: builtin.id, source: 'builtin', written: builtin, tokens, problems: [] };
  }
  if (!isThemeId(id)) return null;
  const name = /** @type {string} */ (id);
  const file = readThemeFile(name);
  if (!file) return (cache.delete(name), null);
  const hit = cache.get(name);
  if (hit?.stamp === file.stamp) return hit.opened;
  /** @type {Problem[]} */
  const unread = file.problem ? [{ path: '', message: `The file ${file.problem}`, level: 'error' }] : [];
  const opened = openTokens(name, file.doc, unread);
  cache.set(name, { stamp: file.stamp, opened });
  return opened;
}

/**
 * A theme resolved and measured: what `GET /themes/:id` answers.
 * @param {Opened} opened
 * @param {(id: string) => unknown} [find] - Where the themes it extends are looked for
 * @returns {{ id: string, source: string, name: string, description: string, scheme: string,
 *   extends: string, theme: Theme, tokens: unknown, roles: Record<string, string>,
 *   variables: Record<string, string>, chain: string[], problems: Problem[] }}
 */
export function describe(opened, find = (id) => openTheme(id)?.written) {
  const strict = opened.source === 'builtin';
  const { problems, effective } = validateTheme(opened.written, { find, strict });
  const theme = normalizeTheme(opened.written, opened.id);
  const { name, description, scheme, roles, chain } = effective;
  return {
    ...{ id: opened.id, source: opened.source, name, description, scheme },
    ...{ extends: theme.extends, theme, tokens: opened.tokens, roles },
    variables: themeVariables(effective),
    chain,
    problems: [...opened.problems, ...problems],
  };
}

/**
 * A theme as one entry of `GET /themes`.
 * @param {Opened} opened
 * @returns {{ id: string, name: string, description: string, scheme: string, source: string,
 *   extends: string, swatches: Record<string, string>, problems: number, errors: number }}
 */
export function summarize(opened) {
  const { id, source, name, description, scheme, roles, problems, ...rest } = describe(opened);
  return {
    ...{ id, name, description, scheme, source, extends: rest.extends },
    swatches: Object.fromEntries(SWATCHES.map((role) => [role, roles[role]])),
    problems: problems.length,
    errors: problems.filter((problem) => problem.level === 'error').length,
  };
}

/**
 * Every theme there is: the built-in ones, then the library's by name.
 * @returns {ReturnType<typeof summarize>[]}
 */
export function listThemes() {
  const library = libraryIds()
    .slice(0, MAX_THEMES)
    .map((id) => openTheme(id))
    .filter(Boolean)
    .map(summarize)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...BUILTIN_THEMES.map((theme) => summarize(openTheme(theme.id))), ...library];
}

/**
 * @param {string} id
 * @returns {ReturnType<typeof describe>}
 * @throws {HttpError} 404 when there is no such theme
 */
export function getTheme(id) {
  const opened = openTheme(id);
  if (!opened) throw new HttpError(404, 'Theme not found');
  return describe(opened);
}

/**
 * Remove a theme of the library. Themes that extend it are listed with a
 * problem from then on; a browser that had chosen it follows the system.
 * @param {string} id
 * @throws {HttpError} 403 for a built-in theme, 404 when there is no such theme
 */
export function deleteTheme(id) {
  if (builtinTheme(id)) throw new HttpError(403, 'Built-in themes cannot be changed');
  if (!isThemeId(id) || !removeThemeFile(id)) throw new HttpError(404, 'Theme not found');
  cache.delete(id);
}
