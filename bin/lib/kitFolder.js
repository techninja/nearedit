/**
 * A kit for the command line: a built-in kit by name, or a kit folder —
 * `kit.json` with its logos and fonts beside it — wherever it lies. A kit
 * folder may extend a built-in kit or another kit folder beside it
 * (`"extends": "base"` is `../base/` seen from the kit). It is read by the
 * same code that reads the server's library, so a kit behaves the same in
 * both places.
 * @module bin/lib/kitFolder
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BUILTIN_KITS, BUILTIN_PREFIX, isId } from '#utils/brand/index.js';
import { openKit } from '../../src/api/kits/chain.js';
import { resolveFrom } from '../../src/api/kits/effective.js';
import { listFiles } from '../../src/api/kits/files.js';
import { readKitFolder } from '../../src/api/kits/folder.js';
import { KIT_FILE } from '../../src/api/kits/limits.js';
import { parseRef } from '../../src/api/kits/names.js';
import { DocumentError } from './document.js';

/** @typedef {import('../../src/api/kits/effective.js').Resolved} Resolved */

/**
 * A kit as the command line loaded it.
 * @typedef {Resolved & { files: { name: string, size: number }[], where: string }} LoadedKit -
 *   `where` is how to name it again: its folder, or `builtin:<name>`
 */

/**
 * Load a kit.
 * @param {string} name - `builtin:<name>`, a kit folder, or its `kit.json`
 * @param {{ library?: string }} [options] - `library`: a folder of kit
 *   folders in which the kits it extends are looked for first — a server's
 *   `data/kits`, for a project's own kit
 * @returns {LoadedKit}
 * @throws {DocumentError} When there is no such kit to speak of
 */
export function loadKit(name, options = {}) {
  if (name.startsWith(BUILTIN_PREFIX)) {
    const link = openKit(parseRef(name));
    if (!link) {
      const known = BUILTIN_KITS.map((kit) => `${BUILTIN_PREFIX}${kit.id}`).join(', ');
      throw new DocumentError(`There is no built-in kit "${name}". There are: ${known}`);
    }
    return { ...resolveFrom(link), files: [], where: link.ref };
  }
  const given = resolve(name);
  const folder = basename(given) === KIT_FILE && !isFolder(given) ? dirname(given) : given;
  if (!isFolder(folder)) throw new DocumentError(`Cannot read kit ${given}: no such folder`);
  if (!existsSync(join(folder, KIT_FILE))) {
    throw new DocumentError(`${folder} is not a kit folder: it has no ${KIT_FILE}`);
  }
  const dir = realpathSync(folder);
  // The kit goes by the id it gives itself; without one, by its folder's name.
  const fallback = isId(basename(dir)) ? basename(dir) : 'kit';
  const id = readKitFolder(dir, fallback)?.named || fallback;
  const head = readKitFolder(dir, id);
  if (!head) throw new DocumentError(`Cannot read ${join(dir, KIT_FILE)}`);
  if (options.library && !isFolder(options.library)) {
    throw new DocumentError(`--library ${options.library}: no such folder`);
  }
  // Another kit of one's own lies beside this one, in a folder of its id — or in the library.
  const shelves = [options.library && realpathSync(options.library), dirname(dir)].filter(Boolean);
  /** @type {(ref: import('../../src/api/kits/names.js').KitRef) => any} */
  const open = (ref) => {
    if (ref.source !== 'library') return openKit(ref);
    const found = shelves.map((shelf) => readKitFolder(join(shelf, ref.id), ref.id)).find(Boolean);
    return found ? { ref: ref.ref, source: 'library', ...found } : null;
  };
  const resolved = resolveFrom({ ref: id, source: 'library', ...head }, { cache: false, open });
  return { ...resolved, files: listFiles(dir), where: folder };
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isFolder(path) {
  return existsSync(path) && statSync(path).isDirectory();
}
