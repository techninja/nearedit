/**
 * Render request validation: preset, range, output name, and the EDL —
 * posted or saved. A posted EDL is untrusted: every `sourceFile` must sit
 * inside an allowed media root, so a request cannot make the server read
 * arbitrary files.
 * @module api/render/request
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseResolution } from '#utils/edl/factory.js';
import { normalizeEdl } from '#utils/edl/normalize.js';
import { getConfig } from '../lib/config.js';
import { isAllowedPath } from '../lib/paths.js';
import { getAdaptation } from '../lib/registry.js';
import { RenderError } from './errors.js';
import { renderSources } from './plan.js';
import { DEFAULT_PRESET, getPreset } from './presets.js';
import { sanitizeFilename } from './store.js';

/**
 * @typedef {Object} RenderRequest
 * @property {any} edl - Checked copy with absolute source paths
 * @property {string} projectId
 * @property {string} adaptationId
 * @property {string} preset
 * @property {{ start: number, end: number } | null} range
 * @property {string} filename - Sanitised `.mp4` name, '' when none was asked for
 * @property {string} name - Adaptation name, for labels and default file names
 */

const MAX_SIDE = 8192;
const invalid = (field, message) =>
  new RenderError(422, `Invalid ${field}`, { fields: { [field]: message } });

/**
 * Copy the EDL with every source path made absolute and checked — on every
 * track, also muted ones.
 * @param {any} edl - Normalised EDL
 * @returns {any}
 * @throws {RenderError} 403 for a path outside the allowed roots
 */
function checkedEdl(edl) {
  const mediaDir = getConfig().devMediaDir;
  const allowed = new Map();
  const checkedClip = (clip) => {
    if (!clip.sourceFile) return clip;
    // Legacy documents name files relative to the dev media directory.
    const file = isAbsolute(clip.sourceFile)
      ? resolve(clip.sourceFile)
      : resolve(mediaDir, clip.sourceFile);
    if (!allowed.has(file)) allowed.set(file, isAllowedPath(file));
    if (!allowed.get(file))
      throw new RenderError(403, 'Path is outside the allowed media folders', { detail: file });
    return { ...clip, sourceFile: file };
  };
  const tracks = edl.tracks.map((track) => ({ ...track, clips: track.clips.map(checkedClip) }));
  return { ...edl, tracks };
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

  const checked = checkedEdl(normal);
  for (const file of renderSources(checked)) {
    if (!existsSync(file))
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
  };
}
