/**
 * Storing a theme in the library, and reading one out of a file someone
 * brings: a Design Tokens document or a Base16 scheme. A theme is written
 * only when it has no error — contrast below AA is a warning in anyone's
 * theme, and is answered with it. Contract: docs/app-spec/THEMES.md § Routes.
 * @module api/themes/write
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { BASE16_NAMES, parseBase16 } from '#utils/theme/base16.js';
import { fromBase16 } from '#utils/theme/base16Map.js';
import { builtinTheme } from '#utils/theme/builtin/index.js';
import { VENDOR, toDesignTokens } from '#utils/theme/designTokens.js';
import { normalizeTheme, themeIdFrom } from '#utils/theme/model.js';
import { printTokens } from '#utils/theme/tokens/print.js';
import { fieldProblems, idProblem } from '#utils/theme/validate.js';
import { HttpError } from '../lib/httpErrors.js';
import { InvalidTheme, hasErrors, invalid } from './errors.js';
import { libraryIds, writeThemeFile } from './files.js';
import { describe, getTheme, openTheme, openTokens } from './library.js';
import { MAX_THEMES, MAX_THEME_BYTES } from './limits.js';

/** @typedef {import('./library.js').Opened} Opened */

const tooLarge = () => new HttpError(413, `A theme may be at most ${MAX_THEME_BYTES / 1024} KB`);

/**
 * @param {string} id
 * @param {unknown} body - `{ theme }` (the plain form) or `{ tokens }` (a Design Tokens document)
 * @returns {Opened} The theme the body would be
 * @throws {InvalidTheme} 422 when the body holds neither
 */
function candidate(id, body) {
  const { theme, tokens } = isPlainObject(body) ? /** @type {Record<string, any>} */ (body) : {};
  if (isPlainObject(tokens)) return openTokens(id, tokens);
  if (!isPlainObject(theme)) throw invalid('', 'needs a theme, or tokens: a Design Tokens document');
  // The plain form is checked as it was sent: what the model drops is said, not hidden.
  const sent = { ...theme, id };
  const opened = openTokens(id, toDesignTokens(normalizeTheme(sent, id)));
  return { ...opened, problems: fieldProblems(sent) };
}

/**
 * Validate a candidate against the library and store it.
 * @param {Opened} opened
 * @returns {ReturnType<typeof describe>} As `GET /themes/:id`, with the warnings
 * @throws {InvalidTheme} 422 when it has an error — nothing is written
 * @throws {HttpError} 409 for a full library, 413 for a theme that is too large
 */
function store(opened) {
  const { id } = opened;
  // The themes it extends see the candidate in its own place, so a loop through it shows.
  const find = (/** @type {string} */ other) => (other === id ? opened : openTheme(other))?.written;
  const described = describe(opened, find);
  if (hasErrors(described.problems)) throw new InvalidTheme(described.problems);
  if (!openTheme(id) && libraryIds().length >= MAX_THEMES) {
    throw new HttpError(409, `The library holds at most ${MAX_THEMES} themes`);
  }
  writeThemeFile(id, printTokens(opened.tokens));
  return { ...getTheme(id), problems: described.problems };
}

/**
 * Create or replace a theme of the library.
 * @param {string} id
 * @param {unknown} body - `{ theme }` or `{ tokens }`
 * @returns {ReturnType<typeof describe>}
 * @throws {HttpError} 403 for a built-in theme, 409, 413, 422 (`InvalidTheme`)
 */
export function putTheme(id, body) {
  if (builtinTheme(id)) {
    const detail = 'Write a theme of your own that extends it';
    throw new HttpError(403, 'Built-in themes cannot be changed', { detail });
  }
  if (idProblem(id)) throw invalid('id', idProblem(id));
  if (Buffer.byteLength(JSON.stringify(body) ?? '') > MAX_THEME_BYTES) throw tooLarge();
  return store(candidate(id, body));
}

/**
 * @param {string} text
 * @returns {{ format: 'tokens'|'base16', theme?: object, tokens?: unknown, notes: string[] }}
 * @throws {InvalidTheme} 422 when the text is neither
 */
function readText(text) {
  if (text.trimStart().startsWith('{')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw invalid('text', `is not JSON: ${err.message}`);
    }
    // A Base16 scheme may also come as JSON: the same keys, with or without `palette`.
    const palette = isPlainObject(json?.palette) ? { ...json, ...json.palette } : json;
    if (!BASE16_NAMES.some((name) => name in palette)) return { format: 'tokens', tokens: json, notes: [] };
    text = Object.entries(palette)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => `${key}: "${value}"`)
      .join('\n');
  }
  const { scheme, problem } = parseBase16(text);
  if (!scheme) throw invalid('text', `is not a Base16 scheme: it ${problem}`);
  return { format: 'base16', ...fromBase16(scheme) };
}

/**
 * Read a theme out of a file's text, and store it when asked.
 * @param {unknown} body - `{ text, id?, name?, store?, replace? }`
 * @returns {ReturnType<typeof describe> & { format: string, notes: string[], stored: boolean }}
 * @throws {HttpError} 409 when storing would replace a theme and `replace` is not set; 413; 422
 */
export function importTheme(body) {
  const { text, id, name, store: keep, replace } = isPlainObject(body) ? /** @type {any} */ (body) : {};
  if (typeof text !== 'string' || !text.trim()) throw invalid('text', 'is required: the text of the file');
  if (Buffer.byteLength(text) > MAX_THEME_BYTES) throw tooLarge();
  const read = readText(text);
  const base = read.tokens ? openTokens('', read.tokens) : null;
  const written = { ...(base ? base.written : read.theme) };
  if (typeof name === 'string' && name.trim()) written.name = name.trim();
  const wanted = id ?? themeIdFrom(written.name);
  if (idProblem(wanted)) {
    const hint = id === undefined ? ' — give the theme an id' : '';
    throw invalid('id', `${idProblem(wanted)}${hint}`);
  }
  if (builtinTheme(wanted)) throw invalid('id', `"${wanted}" is a built-in theme: choose another id`);
  // A Design Tokens file is kept as it came — what other tools wrote into it stays.
  const own = { ...read.tokens?.$extensions?.[VENDOR], name: written.name };
  const tokens = base
    ? { ...read.tokens, $extensions: { ...read.tokens.$extensions, [VENDOR]: own } }
    : toDesignTokens(normalizeTheme(written, wanted));
  const opened = openTokens(wanted, base && !name ? read.tokens : tokens);
  const extra = { format: read.format, notes: read.notes };
  if (!keep) return { ...describe(opened), ...extra, stored: false };
  if (openTheme(wanted) && !replace) {
    throw new HttpError(409, `A theme with the id "${wanted}" is in the library`, {
      detail: 'Send replace: true to replace it, or another id',
    });
  }
  return { ...store(opened), ...extra, stored: true };
}
