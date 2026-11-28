/**
 * Theme files on disk: `<data>/themes/<id>.tokens.json`, each a Design
 * Tokens document. A file is read only when it is a plain file of a
 * bearable size, and written whole or not at all — beside its place first,
 * then renamed into it. Contract: docs/app-spec/THEMES.md § The library.
 * @module api/themes/files
 */

import { randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { TOKENS_SUFFIX } from '#utils/theme/designTokens.js';
import { isThemeId } from '#utils/theme/model.js';
import { getConfig } from '../lib/config.js';
import { HttpError } from '../lib/httpErrors.js';
import { MAX_THEME_BYTES } from './limits.js';

/**
 * @param {string} path
 * @returns {import('node:fs').Stats|null} The thing itself, never what a link points to
 */
function lookAt(path) {
  try {
    return lstatSync(path);
  } catch {
    return null; // nothing there
  }
}

/**
 * @param {string} id - A valid theme id
 * @returns {string} Where that theme of the library is kept
 */
export const themeFile = (id) => join(getConfig().themesDir, `${id}${TOKENS_SUFFIX}`);

/**
 * @returns {string[]} The ids of the theme files in the library; a file
 *   whose name is not an id is not a theme of the library
 */
export function libraryIds() {
  let entries;
  try {
    entries = readdirSync(getConfig().themesDir, { withFileTypes: true });
  } catch {
    return []; // no library yet
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(TOKENS_SUFFIX))
    .map((entry) => entry.name.slice(0, -TOKENS_SUFFIX.length))
    .filter(isThemeId)
    .sort();
}

/**
 * Read a theme file.
 * @param {string} id - A valid theme id
 * @returns {{ doc: unknown, problem: string, stamp: string }|null} null when
 *   there is no such file (a link is not one). `doc` is `{}` with the
 *   `problem` when the file cannot be used; `stamp` changes when the file does
 */
export function readThemeFile(id) {
  const file = themeFile(id);
  const stat = lookAt(file);
  if (!stat?.isFile()) return null;
  const stamp = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
  if (stat.size > MAX_THEME_BYTES) {
    const problem = `is larger than ${MAX_THEME_BYTES / 1024} KB and was not read`;
    return { doc: {}, problem, stamp };
  }
  try {
    return { doc: JSON.parse(readFileSync(file, 'utf8')), problem: '', stamp };
  } catch (err) {
    return { doc: {}, problem: `cannot be read: ${err.message}`, stamp };
  }
}

/**
 * Write a theme file, whole or not at all.
 * @param {string} id - A valid theme id
 * @param {string} text
 * @throws {HttpError} 409 when the library folder or the file's place is
 *   a link or something else the server does not write to, 413 when too large
 */
export function writeThemeFile(id, text) {
  if (Buffer.byteLength(text) > MAX_THEME_BYTES) {
    throw new HttpError(413, `A theme file may be at most ${MAX_THEME_BYTES / 1024} KB`);
  }
  const dir = getConfig().themesDir;
  const folder = lookAt(dir);
  if (folder && !folder.isDirectory()) {
    throw new HttpError(409, 'The theme library is a link or a file: the server does not write there');
  }
  if (!folder) mkdirSync(dir, { recursive: true });
  const file = themeFile(id);
  const taken = lookAt(file);
  if (taken && !taken.isFile()) {
    throw new HttpError(409, `${id}${TOKENS_SUFFIX} is a link or a folder in the theme library`);
  }
  const part = join(dir, `.${id}.${randomBytes(6).toString('hex')}.part`);
  try {
    writeFileSync(part, text, { flag: 'wx' });
    renameSync(part, file);
  } catch (err) {
    rmSync(part, { force: true }); // a failed write leaves nothing behind
    throw err;
  }
}

/**
 * @param {string} id - A valid theme id
 * @returns {boolean} False when there was no such file
 */
export function removeThemeFile(id) {
  if (!lookAt(themeFile(id))?.isFile()) return false;
  rmSync(themeFile(id), { force: true });
  return true;
}
