/**
 * The files of a kit folder: which ones it holds, and where each file a
 * kit names really is. A kit names its logos and fonts relative to its own
 * folder; here every such name becomes an absolute path — or nothing, when
 * it would leave the folder: an absolute name, a `..`, a link that points
 * elsewhere. Nothing a kit says can make the server hand out a path
 * outside the folder the kit lives in.
 * Contract: docs/app-spec/BRAND-API.md § Files.
 * @module api/kits/files
 */

import { readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { mapKitFiles } from '#utils/brand/index.js';
import { isInside } from '../lib/paths.js';
import { FILE_DEPTH, FILE_TYPES, MAX_FILES } from './limits.js';
import { fileKind } from './names.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */

/**
 * One name of a file, looked up in a kit folder.
 * @typedef {Object} Located
 * @property {string} path - Absolute path; '' when the name may not be used
 * @property {string} sig - Changes when the file behind the name does
 * @property {string} problem - '' when the file is there and may be used
 * @property {'error'|'warning'} level
 */

/**
 * The logo and font files in a kit folder and the folders below it.
 * Links, hidden files and files of other kinds are not listed.
 * @param {string} dir - The kit folder
 * @returns {{ name: string, size: number }[]} Names relative to the folder,
 *   with `/` between folders, sorted
 */
export function listFiles(dir) {
  /** @type {{ name: string, size: number }[]} */
  const files = [];
  /** @type {(folder: string, prefix: string, depth: number) => void} */
  const walk = (folder, prefix, depth) => {
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return; // no folder (yet), or one that cannot be read: it holds no files
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || files.length >= MAX_FILES * 4) continue;
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory() && depth < FILE_DEPTH)
        walk(join(folder, entry.name), `${name}/`, depth + 1);
      else if (entry.isFile() && fileKind(entry.name)) {
        const size = statSync(join(folder, entry.name), { throwIfNoEntry: false })?.size;
        if (size !== undefined) files.push({ name, size }); // gone again: not listed
      }
    }
  };
  walk(dir, '', 0);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find the file a kit names.
 * @param {string} dir - The kit folder
 * @param {string} realDir - The same, with links resolved
 * @param {string} ref - As the kit names the file
 * @returns {Located}
 */
function locate(dir, realDir, ref) {
  /** @type {(problem: string) => Located} */
  const refused = (problem) => ({ path: '', sig: 'refused', problem, level: 'error' });
  if (!ref || ref.includes('\0') || isAbsolute(ref) || /^[a-z]:/i.test(ref)) {
    return refused('must be a path relative to the kit folder');
  }
  const path = resolve(dir, ref);
  if (path === resolve(dir) || !isInside(dir, path)) return refused('leaves the kit folder');
  if (!fileKind(path)) return refused(`is not a file a kit holds (${FILE_TYPES.join(', ')})`);
  let real;
  let stat;
  try {
    real = realpathSync(path);
    stat = statSync(real);
  } catch {
    // Named before it was put there: the path is right the moment the file arrives.
    return { path, sig: 'missing', problem: 'is not in the kit folder', level: 'warning' };
  }
  if (!isInside(realDir, real)) return refused('is a link that leaves the kit folder');
  if (!stat.isFile()) return refused('is not a file');
  return { path, sig: `${real}:${stat.size}:${stat.mtimeMs}`, problem: '', level: 'warning' };
}

/**
 * Look up every file a kit names in its folder.
 * @param {string} dir - The kit folder
 * @param {string[]} refs - The names (`kitFiles`)
 * @returns {{ found: Map<string, Located>, sig: string }} `sig` changes
 *   when any of the files does
 */
export function locateFiles(dir, refs) {
  let realDir = resolve(dir);
  try {
    realDir = realpathSync(dir);
  } catch {
    realDir = resolve(dir); // a kit that is not on disk yet names files that are not there
  }
  const found = new Map(refs.map((ref) => [ref, locate(dir, realDir, ref)]));
  const sig = refs.map((ref) => `${ref}=${found.get(ref).sig}`).join('|');
  return { found, sig };
}

/**
 * A kit with every file it names as an absolute path, ready to be resolved.
 * @template {{ tokens?: any, fonts?: any[], elements?: Record<string, any> }} T
 * @param {T} kit - As its folder holds it
 * @param {Map<string, Located>} found - From `locateFiles`
 * @returns {{ kit: T, problems: Problem[] }} A name that may not be used
 *   becomes '' — no logo, no font file — and is reported with its place
 */
export function withAbsoluteFiles(kit, found) {
  /** @type {Problem[]} */
  const problems = [];
  const mapped = mapKitFiles(kit, (ref, where) => {
    const file = found.get(ref);
    if (!file) return '';
    if (file.problem) {
      problems.push({ path: where, message: `"${ref}" ${file.problem}`, level: file.level });
    }
    return file.path;
  });
  return { kit: mapped, problems };
}
