/**
 * Render request validation: preset, range, output name, and the EDL —
 * posted or saved. A posted EDL is untrusted: every file it names — a
 * clip's `sourceFile`, a generator's or effect's image — must sit inside an
 * allowed media root, so a request cannot make the server read arbitrary
 * files. A music clip names no file of its own: it plays the rendering of
 * its song.
 * @module api/render/request
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseResolution } from '#utils/edl/factory.js';
import { normalizeEdl } from '#utils/edl/normalize.js';
import { getConfig } from '../lib/config.js';
import { isAllowedPath } from '../lib/paths.js';
import { getAdaptation, getProjectDir } from '../lib/registry.js';
import { attachMusic } from '../music/timeline.js';
import { RenderError } from './errors.js';
import { mapMediaPaths, renderImages } from './mediaPaths.js';
import { renderSources } from './plan.js';
import { DEFAULT_PRESET, getPreset } from './presets.js';
import { sanitizeFilename } from './store.js';
import { SUBTITLE_FORMATS } from './subtitles.js';

/**
 * @typedef {Object} RenderRequest
 * @property {any} edl - Checked copy with absolute source paths
 * @property {string} projectId
 * @property {string} adaptationId
 * @property {string} preset
 * @property {{ start: number, end: number } | null} range
 * @property {string} filename - Sanitised `.mp4` name, '' when none was asked for
 * @property {string} name - Adaptation name, for labels and default file names
 * @property {string} subtitles - `srt` or `vtt`: also save the captions as a
 *   subtitle file beside the video; '' when none was asked for
 */

const MAX_SIDE = 8192;
const invalid = (field, message) =>
  new RenderError(422, `Invalid ${field}`, { fields: { [field]: message } });

/**
 * Copy the EDL with every file path — clip sources and the image parameters
 * of generators and effects — made absolute and checked, on every track,
 * also muted ones.
 * @param {any} edl - Normalised EDL
 * @returns {any}
 * @throws {RenderError} 403 for a path outside the allowed roots
 */
function checkedEdl(edl) {
  const mediaDir = getConfig().devMediaDir;
  const allowed = new Map();
  return mapMediaPaths(edl, (path) => {
    // Legacy documents name files relative to the dev media directory.
    const file = isAbsolute(path) ? resolve(path) : resolve(mediaDir, path);
    if (!allowed.has(file)) allowed.set(file, isAllowedPath(file));
    if (!allowed.get(file))
      throw new RenderError(403, 'Path is outside the allowed media folders', { detail: file });
    return file;
  });
}

/**
 * Validate the body of `POST /render` and `POST /render/plan`.
 * @param {any} body
 * @returns {RenderRequest}
 * @throws {RenderError} 400, 403, 404 or 422 describing what is wrong
 */
export function parseRenderRequest(body) {
  if (!body || typeof body !== 'object') throw new RenderError(400, 'JSON body required');
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const adaptationId = typeof body.adaptationId === 'string' ? body.adaptationId : '';
  const preset = body.preset ?? DEFAULT_PRESET;
  if (!getPreset(preset)) throw invalid('preset', 'Must be one of: draft, standard, high');

  let range = null;
  if (body.range !== undefined && body.range !== null) {
    const start = Number(body.range.start);
    const end = Number(body.range.end);
    if (!(start >= 0) || !(end > start))
      throw invalid('range', 'Needs 0 <= start < end, in seconds');
    range = { start, end };
  }
  const filename = body.filename ? sanitizeFilename(body.filename) : '';
  const subtitles = body.subtitles ?? '';
  if (subtitles !== '' && !SUBTITLE_FORMATS.includes(subtitles))
    throw invalid('subtitles', 'Must be one of: srt, vtt');

  const adaptation = projectId ? getAdaptation(projectId, adaptationId || undefined) : null;
  let edl = body.edl;
  if (edl === undefined || edl === null) {
    if (!projectId) throw new RenderError(400, 'projectId or edl required');
    if (!adaptation) throw new RenderError(404, 'Adaptation not found');
    // An adaptation that was never edited has no EDL yet: an empty timeline.
    const { fps, resolution } = adaptation;
    edl = { fps, resolution, tracks: [], ...adaptation.edl };
  }
  if (typeof edl !== 'object' || !Array.isArray(edl.tracks))
    throw invalid('edl', 'Must be an EDL document with a tracks array');
  // Same repair the editor applies on load: v1 files, missing fields, bad overlaps.
  const normal = normalizeEdl(edl);
  const size = parseResolution(normal.resolution);
  if (size.width < 16 || size.height < 16 || size.width > MAX_SIDE || size.height > MAX_SIDE)
    throw invalid('edl', `resolution must be between 16 and ${MAX_SIDE} pixels a side`);

  // A music clip plays the rendering of its song, in the project (without one: in the data
  // folder). One that is not there yet is made when the render starts (prepare.js).
  const music = attachMusic(normal, [resolve(getProjectDir(projectId) || getConfig().dataDir)]);
  const coming = new Set(music.missing.map((song) => song.file));
  const checked = checkedEdl(music.edl);
  for (const file of new Set([...renderSources(checked), ...renderImages(checked)])) {
    if (!existsSync(file) && !coming.has(file))
      throw new RenderError(422, `Source file not found: ${file}`, { detail: file });
  }
  return {
    edl: checked,
    projectId,
    adaptationId,
    preset,
    range,
    filename,
    name: adaptation?.name || '',
    subtitles,
  };
}
