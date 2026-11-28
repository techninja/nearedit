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
import { captionFindings, isCaptionsOwn } from './captionsCheck.js';
import { catalogFindings } from './catalogCheck.js';
import { attachCutouts, isCutoutFile, uncutFindings } from './cutoutClips.js';
import { jsonErrorOffset, lineAndColumn } from './jsonError.js';
import * as music from './musicClips.js';
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
 * @property {import('./musicClips.js').Unrendered[]} unrendered - Music clips without a rendering
 * @property {import('./cutoutClips.js').Uncut[]} uncut - Person cutouts that are not made
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
    const known = { ENOENT: 'no such file', EISDIR: 'it is a folder' };
    throw new DocumentError(`Cannot read ${file}: ${known[err.code] || err.message}`);
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
  // A web clip's footage is its recording beside the document, when there is one;
  // a music clip's sound the rendering of its song.
  const recorded = attachRecordings(normalizeEdl(raw), dir, folders);
  const { unrecorded } = recorded;
  const { edl: normal, unrendered } = music.attachRenderings(recorded.edl, dir, folders);
  const repaired = repairFindings(raw, normal);
  const repairs = repaired.filter((one) => !music.isSongsOwn(one, tracks) && !isCaptionsOwn(one));
  /** @type {Finding[]} */
  const findings = [...repairs, ...captionFindings(raw, repaired), ...catalogFindings(normal)];
  findings.push(...recipeFindings(tracks), ...unrecordedFindings(normal, unrecorded));
  findings.push(...music.songFindings(tracks), ...music.unrenderedFindings(tracks, unrendered));
  const media = new Set();
  const edl = mapMediaPaths(normal, (name, where) => {
    // Relative to the document's folder; failing that, to a --media folder.
    const candidates = isAbsolute(name)
      ? [name]
      : [dir, ...folders].map((base) => resolve(base, name));
    const found = candidates.find((candidate) => existsSync(candidate));
    // A cutout file that is not there (or not ours to read) is looked for on disk instead.
    const derived = isCutoutFile(where);
    if (!found) {
      if (derived) return '';
      // A font that is not there is drawn in another, as the compositor does: no reason to stop.
      const font = /(^|\.)fonts\[\d+\]\.file$/.test(where);
      const message = font
        ? `font file not found: ${name} — its text is drawn in the bundled sans-serif`
        : `file not found: ${name}`;
      findings.push({ path: where, level: font ? 'warning' : 'error', message });
      return resolve(dir, name);
    }
    const real = realpathSync(found);
    if (![dir, ...folders].some((root) => isInside(root, real))) {
      if (derived) return '';
      const message = `${name} is outside the document's folder — allow its folder with --media <dir>`;
      findings.push({ path: where, level: 'error', message });
      return resolve(dir, name);
    }
    if (!derived) media.add(real);
    return real;
  });
  // A clip with cutout on is drawn through the cutout file found for it; without one, plain.
  const cut = attachCutouts(edl, [dir, ...folders]);
  findings.push(...uncutFindings(cut.edl, cut.uncut));
  const made = { unrecorded, unrendered, uncut: cut.uncut };
  return { file, dir, edl: cut.edl, findings, media: [...media], ...made };
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
