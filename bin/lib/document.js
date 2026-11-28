/**
 * Loading a standalone document for the command line: read and parse the
 * file, normalise it, resolve every media path against the document's own
 * folder, and collect everything that is wrong or was repaired — with the
 * place in the document it concerns. Only files under the document's folder
 * and the `--media` folders may be named; nothing else is ever read.
 * @module bin/lib/document
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizeEdl } from '#utils/edl/normalize.js';
import { isInside } from '../../src/api/lib/paths.js';
import { mapMediaPaths } from '../../src/api/render/mediaPaths.js';
import { catalogFindings } from './catalogCheck.js';
import { jsonErrorOffset, lineAndColumn } from './jsonError.js';
import { repairFindings } from './repairs.js';
import { attachRecordings, recipeFindings, unrecordedFindings } from './webClips.js';

/** A document that cannot be used (exit code 1). */
export class DocumentError extends Error {}

/**
 * @typedef {import('./repairs.js').Finding} Finding
 * @typedef {Object} Loaded
 * @property {string} file - Absolute path of the document
 * @property {any} edl - Normalised, with absolute media paths
 * @property {Finding[]} findings - Errors and warnings, in document order
 * @property {string[]} media - Every media file the document names
 * @property {string} dir - The document's folder
 * @property {import('./webClips.js').Unrecorded[]} unrecorded - Web clips without a recording
 */

/**
 * @param {string} file
 * @returns {any} The parsed JSON
 * @throws {DocumentError} When the file cannot be read or is not JSON
 */
export function parseFile(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    const why =
      err.code === 'ENOENT'
        ? 'no such file'
        : err.code === 'EISDIR'
          ? 'it is a folder'
          : err.message;
    throw new DocumentError(`Cannot read ${file}: ${why}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const offset = jsonErrorOffset(text);
    const where = offset >= 0 ? ` (${lineAndColumn(text, offset)})` : '';
    throw new DocumentError(`${file} is not valid JSON${where}: ${err.message.split('\n')[0]}`);
  }
}

/**
 * Load a document.
 * @param {string} path - The JSON file, relative to the working directory or absolute
 * @param {{ media?: string[] }} [options] - Further folders media may be read from
 * @returns {Loaded}
 * @throws {DocumentError} When there is no document to speak of
 */
export function loadDocument(path, options = {}) {
  const file = resolve(path);
  const raw = parseFile(file);
  const tracks = Array.isArray(raw) ? raw : raw?.tracks;
  if (!Array.isArray(tracks))
    throw new DocumentError(`${file} is not a timeline document: it needs a "tracks" array`);
  const dir = dirname(realpathSync(file));
  const folders = (options.media || []).map((folder) => {
    if (!existsSync(folder) || !statSync(folder).isDirectory())
      throw new DocumentError(`--media ${folder}: no such folder`);
    return realpathSync(folder);
  });
  // A web clip's footage is its recording beside the document, when there is one.
  const { edl: normal, unrecorded } = attachRecordings(normalizeEdl(raw), dir, folders);
  /** @type {Finding[]} */
  const findings = [...repairFindings(raw, normal), ...catalogFindings(normal)];
  findings.push(...recipeFindings(tracks), ...unrecordedFindings(normal, unrecorded));
  const media = new Set();
  const edl = mapMediaPaths(normal, (name, where) => {
    // Relative to the document's folder; failing that, to a --media folder.
    const candidates = isAbsolute(name)
      ? [name]
      : [dir, ...folders].map((base) => resolve(base, name));
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      findings.push({ path: where, level: 'error', message: `file not found: ${name}` });
      return resolve(dir, name);
    }
    const real = realpathSync(found);
    if (![dir, ...folders].some((root) => isInside(root, real))) {
      const message = `${name} is outside the document's folder — allow its folder with --media <dir>`;
      findings.push({ path: where, level: 'error', message });
      return resolve(dir, name);
    }
    media.add(real);
    return real;
  });
  return { file, dir, edl, findings, media: [...media], unrecorded };
}

/**
 * @param {Finding[]} findings
 * @returns {{ errors: Finding[], warnings: Finding[] }}
 */
export function byLevel(findings) {
  return {
    errors: findings.filter((finding) => finding.level === 'error'),
    warnings: findings.filter((finding) => finding.level === 'warning'),
  };
}

/**
 * One line per finding: `error  tracks[0].clips[1].fadeIn: must be a number`.
 * @param {Finding[]} findings
 * @returns {string[]}
 */
export function describe(findings) {
  return findings.map(
    ({ level, path, message }) => `${level.padEnd(7)} ${path ? `${path}: ` : ''}${message}`,
  );
}
