/**
 * Loading and replacing an adaptation's EDL.
 *
 * The adaptation and its EDL both carry the frame size and rate. They are
 * kept equal: whichever one a client changes, the other follows.
 *
 * Integration seam: `readEdl` is where the full v1 → v2 normaliser
 * (`src/utils/edl/normalize.js`) belongs once it exists, and `replaceEdl` is
 * where it should run after the structural guard. Until then documents are
 * stored as sent, with only the top-level v2 fields filled in.
 * @module api/projects/edl
 */

import { EDL_VERSION } from '#utils/edl/factory.js';
import { HttpError } from '../lib/httpErrors.js';
import { aspectOf, parseSize } from './adaptationFields.js';
import { emptyEdl, findAdaptation } from './adaptations.js';
import { checkEdl } from './edlGuard.js';
import { requireProject, saveProject } from './store.js';

/**
 * Give a stored document the top-level shape of a v2 EDL.
 * @param {any} stored - What the project file holds (possibly a v1 document, or nothing)
 * @param {{ fps: number, resolution: string }} adaptation
 * @returns {any}
 */
function withDocumentFields(stored, adaptation) {
  const base = emptyEdl(adaptation.resolution, adaptation.fps);
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.tracks)) return base;
  return {
    ...base,
    ...stored,
    version: EDL_VERSION,
    fps: Number.isFinite(stored.fps) && stored.fps > 0 ? stored.fps : base.fps,
    resolution: parseSize(stored.resolution) ? stored.resolution : base.resolution,
    markers: Array.isArray(stored.markers) ? stored.markers : [],
  };
}

/**
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {any} The adaptation's EDL
 * @throws {HttpError} 404 for an unknown project or adaptation
 */
export function readEdl(projectId, adaptationId) {
  const { project } = requireProject(projectId);
  const adaptation = findAdaptation(project, adaptationId);
  return withDocumentFields(adaptation.edl, adaptation);
}

/**
 * Replace an adaptation's EDL.
 * @param {string} projectId
 * @param {string} adaptationId
 * @param {unknown} doc - Parsed request body
 * @returns {{ ok: true, adaptationId: string, updatedAt: string }}
 * @throws {HttpError} 404 for an unknown project or adaptation, 422 for a broken document
 */
export function replaceEdl(projectId, adaptationId, doc) {
  const { project } = requireProject(projectId);
  const adaptation = findAdaptation(project, adaptationId);
  const problems = checkEdl(doc);
  const where = Object.keys(problems);
  if (where.length) {
    const detail = `${where[0]} ${problems[where[0]]}`;
    throw new HttpError(422, 'Invalid EDL document', { detail, fields: problems });
  }
  const edl = withDocumentFields(doc, adaptation);
  adaptation.edl = edl;
  adaptation.updatedAt = new Date().toISOString();
  adaptation.fps = edl.fps;
  if (edl.resolution !== adaptation.resolution) {
    adaptation.resolution = edl.resolution;
    adaptation.aspectRatio = aspectOf(edl.resolution);
  }
  saveProject(projectId, project);
  return { ok: true, adaptationId, updatedAt: adaptation.updatedAt };
}
