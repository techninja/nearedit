/**
 * Adaptations — the aspect-ratio-locked timeline variants of a project. They
 * live inside the project file; each one owns an EDL. Every function here
 * works on a project object in memory; the caller persists it.
 * @module api/projects/adaptations
 */

import { randomUUID } from 'node:crypto';
import { createEdl } from '#utils/edl/factory.js';
import { HttpError, assertValid } from '../lib/httpErrors.js';
import { cleanAdaptationFields, settleFrame } from './adaptationFields.js';

/** View state stored with a document so reopening restores the editor (EDL.md). */
const VIEW_DEFAULTS = { playheadPosition: 0, cursorPosition: 0, zoom: 1, scrollX: 0 };

/**
 * An empty timeline for a frame size and rate.
 * @param {string} [resolution] - Falls back to the EDL default when missing
 * @param {number} [fps]
 * @returns {object}
 */
export function emptyEdl(resolution, fps) {
  const settings = { ...(resolution && { resolution }), ...(fps && { fps }) };
  return { ...createEdl(settings), ...VIEW_DEFAULTS };
}

/**
 * The adaptation as API clients see it: settings only. The EDL has its own
 * routes and is far too large to ride along with every project response.
 * @param {any} adaptation
 * @param {string} projectId
 * @returns {object}
 */
export function publicAdaptation(adaptation, projectId) {
  const settings = { ...adaptation, projectId };
  settings.parentAdaptationId = adaptation.parentAdaptationId || '';
  delete settings.edl;
  return settings;
}

/**
 * @param {any} project
 * @param {string} adaptationId
 * @returns {any} The adaptation
 * @throws {HttpError} 404 when the project has no such adaptation
 */
export function findAdaptation(project, adaptationId) {
  const found = (project.adaptations || []).find((a) => a.id === adaptationId);
  if (!found) throw new HttpError(404, 'Adaptation not found');
  return found;
}

/**
 * Build a new adaptation and append it to the project.
 * @param {any} project - Mutated: the adaptation is pushed onto `adaptations`
 * @param {any} body - `{ name, aspectRatio?, resolution?, fps?, parentAdaptationId?, copyFrom? }`
 * @returns {any} The new adaptation, including its EDL
 * @throws {HttpError} 422 on invalid fields or unknown parent / copy source
 */
export function addAdaptation(project, body) {
  const input = body && typeof body === 'object' ? body : {};
  const wanted = cleanAdaptationFields(input);
  const list = (project.adaptations ||= []);
  const byId = (id) => list.find((a) => a.id === id);
  const source = input.copyFrom ? byId(input.copyFrom) : null;
  const parentId = input.parentAdaptationId || '';

  /** @type {Record<string, string>} */
  const fields = {};
  if (!wanted.name) fields.name = 'name is required';
  if (input.copyFrom && !source) fields.copyFrom = 'No such adaptation in this project';
  if (parentId && !byId(parentId)) fields.parentAdaptationId = 'No such adaptation in this project';
  assertValid(fields);

  const frame = settleFrame(wanted, source || {});
  const fps = wanted.fps ?? source?.fps ?? 30;
  const now = new Date().toISOString();
  const adaptation = {
    id: randomUUID(),
    name: wanted.name,
    parentAdaptationId: parentId,
    ...frame,
    fps,
    status: wanted.status || 'draft',
    createdAt: now,
    updatedAt: now,
    // A copy keeps the brand kit its source chose for itself (BRAND-API.md § A project's kit).
    ...(typeof source?.kit === 'string' && source.kit && { kit: source.kit }),
    // A copy is independent of its source from here on, so it is deep-cloned.
    edl: source?.edl
      ? { ...structuredClone(source.edl), fps, resolution: frame.resolution }
      : emptyEdl(frame.resolution, fps),
  };
  list.push(adaptation);
  return adaptation;
}

/**
 * Update an adaptation's settings in place. Frame size and rate are written
 * through to its EDL, which carries its own copy of both.
 * @param {any} project
 * @param {string} adaptationId
 * @param {any} body - Any of name, aspectRatio, resolution, fps, status
 * @returns {any} The updated adaptation
 */
export function patchAdaptation(project, adaptationId, body) {
  const adaptation = findAdaptation(project, adaptationId);
  const wanted = cleanAdaptationFields(body);
  const frame = settleFrame(wanted, adaptation);
  Object.assign(adaptation, wanted, frame, { updatedAt: new Date().toISOString() });
  if (adaptation.edl && typeof adaptation.edl === 'object') {
    Object.assign(adaptation.edl, { fps: adaptation.fps, resolution: adaptation.resolution });
  }
  return adaptation;
}

/**
 * Remove an adaptation. Its children move up to its parent so no adaptation
 * is left pointing at one that no longer exists.
 * @param {any} project
 * @param {string} adaptationId
 * @throws {HttpError} 404 when unknown, 409 when it is the last one
 */
export function removeAdaptation(project, adaptationId) {
  const removed = findAdaptation(project, adaptationId);
  if (project.adaptations.length <= 1) {
    throw new HttpError(409, 'The last adaptation of a project cannot be deleted');
  }
  const newParent = removed.parentAdaptationId || '';
  project.adaptations = project.adaptations.filter((a) => a !== removed);
  for (const other of project.adaptations) {
    if (other.parentAdaptationId === removed.id) other.parentAdaptationId = newParent;
  }
}
