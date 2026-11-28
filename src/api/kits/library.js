/**
 * The library — a person's or a team's kits, one folder each under
 * `<data>/kits/` — together with the built-in kits, which are listed and
 * read the same way and cannot be written.
 * Contract: docs/app-spec/BRAND-API.md § Routes.
 * @module api/kits/library
 */

import { readdirSync, rmSync } from 'node:fs';
import { BUILTIN_KITS, BUILTIN_PREFIX, isId } from '#utils/brand/index.js';
import { getConfig } from '../lib/config.js';
import { HttpError } from '../lib/httpErrors.js';
import { libraryKitDir, openKit } from './chain.js';
import { resolveFrom } from './effective.js';
import { InvalidKit } from './errors.js';
import { MAX_KITS, PROJECT_CHOICE, RESERVED_IDS } from './limits.js';
import { parseRef } from './names.js';
import { describe, summarize, writeKit } from './store.js';

const notFound = () => new HttpError(404, 'Kit not found');
const builtIn = () =>
  new HttpError(403, 'Built-in kits cannot be changed', {
    detail: 'Write a kit of your own that extends it',
  });

/**
 * @returns {string[]} The ids of the library's kit folders. A folder named
 *   like a built-in kit, or `project`, is not a kit of the library
 */
function libraryIds() {
  let entries;
  try {
    entries = readdirSync(getConfig().kitsDir, { withFileTypes: true });
  } catch {
    return []; // no library yet
  }
  return entries
    .filter((entry) => entry.isDirectory() && isId(entry.name))
    .map((entry) => entry.name)
    .filter((id) => !RESERVED_IDS.includes(id));
}

/**
 * Every kit there is: the built-in ones, then the library's by name. A kit
 * that cannot be resolved is listed all the same, with its problems counted.
 * @returns {ReturnType<typeof summarize>[]}
 */
export function listKits() {
  const builtin = BUILTIN_KITS.map((kit) => openKit(parseRef(`${BUILTIN_PREFIX}${kit.id}`)));
  const library = libraryIds()
    .slice(0, MAX_KITS)
    .map((id) => openKit(parseRef(id)))
    .filter(Boolean)
    .map((link) => summarize(resolveFrom(link)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...builtin.map((link) => summarize(resolveFrom(link))), ...library];
}

/**
 * @param {string} id - A library id or `builtin:<name>`
 * @returns {ReturnType<typeof describe>}
 * @throws {HttpError} 404 when there is no such kit
 */
export function getKit(id) {
  const ref = parseRef(id);
  const link = ref && ref.source !== 'project' ? openKit(ref) : null;
  if (!link) throw notFound();
  return describe(resolveFrom(link));
}

/**
 * The folder of a library kit that is there, for its files to be changed.
 * @param {string} id
 * @returns {string}
 * @throws {HttpError} 403 for a built-in kit, 404 when there is no such kit
 */
export function libraryFolder(id) {
  const ref = parseRef(id);
  if (ref?.source === 'builtin') throw builtIn();
  const link = ref?.source === 'library' ? openKit(ref) : null;
  if (!link) throw notFound();
  return link.dir;
}

/**
 * Create or replace a kit of the library.
 * @param {string} id
 * @param {unknown} kit - As it was sent; its own `id` is replaced by this one
 * @returns {ReturnType<typeof describe>} As `getKit`, with the warnings
 *   about what was sent
 * @throws {HttpError} 403 for a built-in kit, 409 for a full library, 413, 422 (`InvalidKit`)
 */
export function putKit(id, kit) {
  const ref = parseRef(id);
  if (ref?.source === 'builtin') throw builtIn();
  if (!ref || ref.source !== 'library') {
    const message =
      id === PROJECT_CHOICE
        ? `"${PROJECT_CHOICE}" names a project's own kit and cannot be a kit of the library`
        : 'must be letters, digits, - and _, at most 40, starting with a letter or a digit';
    throw new InvalidKit([{ path: 'id', message, level: 'error' }]);
  }
  if (!openKit(ref) && libraryIds().length >= MAX_KITS) {
    throw new HttpError(409, `The library holds at most ${MAX_KITS} kits`);
  }
  const { problems } = writeKit(ref, libraryKitDir(ref.id), kit);
  return { ...getKit(ref.id), problems };
}

/**
 * Remove a kit of the library with its files. Kits that extend it are
 * listed with a problem from then on; projects that chose it fall back to
 * `builtin:clean`.
 * @param {string} id
 * @throws {HttpError} 403 for a built-in kit, 404 when there is no such kit
 */
export function deleteKit(id) {
  rmSync(libraryFolder(id), { recursive: true, force: true });
}
