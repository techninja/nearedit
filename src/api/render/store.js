/**
 * Finished renders on disk: `<rendersDir>/<name>.mp4` with a small
 * `<name>.mp4.json` record beside it — and, when the render was asked for
 * subtitles, `<name>.srt` or `<name>.vtt`. Names taken from a request are
 * always reduced to a plain file name inside the renders directory.
 * @module api/render/store
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getConfig } from '../lib/config.js';
import { readJson, writeJsonAtomic } from '../lib/registry.js';
import { RenderError } from './errors.js';
import { SUBTITLE_FORMATS, subtitleName } from './subtitles.js';

const EXT = '.mp4';
/** What a render name may end in: the video, or the subtitle file saved beside it. */
const SERVED = [EXT, ...SUBTITLE_FORMATS.map((format) => `.${format}`)];

/** @returns {string} The renders directory (created on demand). */
export function rendersDir() {
  const dir = getConfig().rendersDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Turn a requested output name into a safe `.mp4` file name.
 * @param {unknown} name
 * @param {string} [fallback='render']
 * @returns {string}
 * @throws {RenderError} 422 when the name contains a path separator
 */
export function sanitizeFilename(name, fallback = 'render') {
  const raw = typeof name === 'string' ? name : '';
  if (/[/\\\0]/.test(raw))
    throw new RenderError(422, 'filename must not contain path separators', {
      fields: { filename: 'Use a plain file name' },
    });
  const stem = raw
    .normalize('NFC')
    .replace(/\.mp4$/i, '')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 120);
  return `${stem || fallback}${EXT}`;
}

/**
 * A name that does not collide with an existing render ("a.mp4" → "a-2.mp4").
 * @param {string} file - Sanitised file name
 * @returns {string}
 */
export function uniqueName(file) {
  const dir = rendersDir();
  const stem = file.slice(0, -EXT.length);
  let candidate = file;
  for (let n = 2; existsSync(join(dir, candidate)); n++) candidate = `${stem}-${n}${EXT}`;
  return candidate;
}

/**
 * True for a plain `.mp4` file name — or that of a subtitle file beside
 * one: no directories, not hidden.
 * @param {unknown} name
 * @returns {boolean}
 */
export function isRenderName(name) {
  if (typeof name !== 'string' || !name || name !== basename(name)) return false;
  const known = SERVED.some((ext) => name.toLowerCase().endsWith(ext));
  return !/[/\\\0]/.test(name) && !name.startsWith('.') && known;
}

/**
 * Resolve a render name from a URL to its path.
 * @param {unknown} name
 * @returns {string|null} null unless it names an existing render
 */
export function resolveRender(name) {
  if (!isRenderName(name)) return null;
  const path = join(rendersDir(), /** @type {string} */ (name));
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

/** @param {string} file @returns {string} URL that serves a render. */
export const renderUrl = (file) => `/api/render/file/${encodeURIComponent(file)}`;

/**
 * Store the record of a finished render.
 * @param {string} file - Render file name
 * @param {object} meta - projectId, adaptationId, preset, duration, createdAt…
 */
export function writeRecord(file, meta) {
  writeJsonAtomic(join(rendersDir(), `${file}.json`), { file, ...meta });
}

/**
 * List finished renders, newest first.
 * @param {string} [projectId] - Only renders of this project
 * @returns {object[]} `{ file, url, size, createdAt, projectId, adaptationId, …,
 *   subtitles?, subtitlesUrl? }`
 */
export function listRenders(projectId) {
  const dir = rendersDir();
  const renders = [];
  for (const file of readdirSync(dir)) {
    if (file.startsWith('.') || !file.toLowerCase().endsWith(EXT)) continue;
    const stat = statSync(join(dir, file));
    if (!stat.isFile()) continue;
    /** @type {any} */
    const record = readJson(join(dir, `${file}.json`), {});
    if (projectId && record.projectId !== projectId) continue;
    // A subtitle file that was deleted on its own is no longer part of the render.
    if (record.subtitles && !resolveRender(record.subtitles)) {
      delete record.subtitles;
      delete record.subtitlesUrl;
    }
    renders.push({
      projectId: '',
      adaptationId: '',
      ...record,
      ...{ file, url: renderUrl(file), size: stat.size },
      createdAt: record.createdAt || Math.round(stat.mtimeMs),
    });
  }
  return renders.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a render with its record and its subtitle files — or, named by
 * itself, one subtitle file.
 * @param {unknown} name
 * @returns {boolean} false when there is no such render
 */
export function deleteRender(name) {
  const path = resolveRender(name);
  if (!path) return false;
  rmSync(path, { force: true });
  if (!path.toLowerCase().endsWith(EXT)) return true;
  rmSync(`${path}.json`, { force: true });
  for (const format of SUBTITLE_FORMATS) rmSync(subtitleName(path, format), { force: true });
  return true;
}
