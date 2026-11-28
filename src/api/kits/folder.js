/**
 * A kit folder on disk — `kit.json` with the files it names beside it —
 * read into the kit model. Whatever the file holds, the result is a kit:
 * hand-written JSON, a broken file and a file that is far too large are
 * read as far as they can be and come with their problems. A folder is
 * read again only when its `kit.json` changed on disk.
 * Contract: docs/app-spec/BRAND-API.md § Storage.
 * @module api/kits/folder
 */

import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kitFiles, normalizeKit, validateKit } from '#utils/brand/index.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { KIT_FILE, MAX_DESCRIPTION, MAX_KIT_JSON } from './limits.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */
/** @typedef {import('#utils/brand/types.js').Kit & { description: string }} StoredKit */

/**
 * A kit as a folder holds it.
 * @typedef {Object} KitFolder
 * @property {string} dir - The folder
 * @property {StoredKit} kit - Normalised; its id is the one it is known by
 * @property {Problem[]} problems - What is wrong with `kit.json` as it was written
 * @property {string[]} refs - The files it names, as it names them
 * @property {string} stamp - Changes whenever `kit.json` does
 */

/** @type {Map<string, { stamp: string, folder: KitFolder }>} kit.json path → what it held */
const cache = new Map();

/**
 * Read a kit out of parsed JSON: what the model keeps of it, and what a
 * person should hear about the rest.
 * @param {unknown} raw - A parsed `kit.json`, or the `kit` of a request
 * @param {string} id - The id the kit is known by: its folder's name, or `project`
 * @returns {{ kit: StoredKit, problems: Problem[] }}
 */
export function readKit(raw, id) {
  const given = isPlainObject(raw) ? /** @type {Record<string, any>} */ (raw) : null;
  const { problems } = validateKit(given ? { ...given, id } : raw);
  if (given && given.id !== undefined && given.id !== id) {
    const message = `is ${JSON.stringify(given.id)} in the file; the kit is known as "${id}"`;
    problems.push({ path: 'id', message, level: 'warning' });
  }
  const { name, tokens, fonts, elements, defaults, ...rest } = normalizeKit(given);
  const description =
    typeof given?.description === 'string' ? given.description.slice(0, MAX_DESCRIPTION) : '';
  const kit = { id, name, description, extends: rest.extends, tokens, fonts, elements, defaults };
  return { kit, problems };
}

/**
 * @param {string} file - A `kit.json`
 * @param {number} size - Its size, bytes
 * @returns {{ raw: unknown, problems: Problem[] }} What it holds; `{}` with
 *   the reason when it cannot be read
 */
function parse(file, size) {
  /** @type {(message: string) => { raw: unknown, problems: Problem[] }} */
  const unread = (message) => ({ raw: {}, problems: [{ path: '', message, level: 'error' }] });
  if (size > MAX_KIT_JSON) {
    return unread(`${KIT_FILE} is larger than ${MAX_KIT_JSON / 1024} KB and was not read`);
  }
  try {
    return { raw: JSON.parse(readFileSync(file, 'utf8')), problems: [] };
  } catch (err) {
    return unread(`${KIT_FILE} cannot be read: ${err.message}`);
  }
}

/**
 * Read a kit folder.
 * @param {string} dir - Absolute path of the folder
 * @param {string} id - The id the kit is known by
 * @returns {KitFolder|null} null when there is no kit here: no folder, no
 *   `kit.json`, or either of them is a link rather than the thing itself
 */
export function readKitFolder(dir, id) {
  const file = join(dir, KIT_FILE);
  let stat;
  try {
    stat = lstatSync(dir).isDirectory() ? lstatSync(file) : null;
  } catch {
    stat = null; // nothing there
  }
  if (!stat?.isFile()) {
    cache.delete(file);
    return null;
  }
  const stamp = `${id}:${stat.mtimeMs}:${stat.size}:${stat.ino}`;
  const hit = cache.get(file);
  if (hit?.stamp === stamp) return hit.folder;
  const { raw, problems: unread } = parse(file, stat.size);
  const { kit, problems } = readKit(raw, id);
  const folder = { dir, kit, problems: [...unread, ...problems], refs: kitFiles(kit), stamp };
  cache.set(file, { stamp, folder });
  return folder;
}
