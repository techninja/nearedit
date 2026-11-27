/**
 * The persisted shape of an adaptation's timeline: the EDL document plus
 * the four view fields that restore where the editor was (EDL.md).
 * Isomorphic and pure.
 * @module utils/edl/savedDocument
 */

import { normalizeEdl } from './normalize.js';
import { isObject, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * View state that is saved with the document.
 * @typedef {Object} SavedView
 * @property {number} playheadPosition - Seconds
 * @property {number} cursorPosition - Seconds
 * @property {number} zoom - 1 = 100 px per second
 * @property {number} scrollX - Pixels
 */

/**
 * @param {any} source
 * @returns {SavedView} Sanitised view fields with their defaults
 */
function viewOf(source) {
  const from = isObject(source) ? source : {};
  const project = isObject(from.project) ? from.project : {};
  const zoom = toNumber(from.zoom, 1);
  return {
    playheadPosition: Math.max(0, toNumber(from.playheadPosition ?? project.playheadPosition, 0)),
    cursorPosition: Math.max(0, toNumber(from.cursorPosition, 0)),
    zoom: zoom > 0 ? zoom : 1,
    scrollX: Math.max(0, toNumber(from.scrollX, 0)),
  };
}

/**
 * Merge the document and the view fields into the shape that is saved
 * (`PUT /api/projects/:id/edl/:aid`).
 * @param {Edl} edl
 * @param {Partial<SavedView>} [view] - e.g. the ViewState store model
 * @returns {Edl & SavedView}
 */
export function toSavedDocument(edl, view = {}) {
  const { version, fps, resolution, tracks, markers } = edl;
  return { version, fps, resolution, tracks, markers: markers || [], ...viewOf(view) };
}

/**
 * Split a loaded document into the normalised EDL (for the edit session)
 * and the view fields (for `ViewState`). Accepts v1 files and garbage.
 * @param {any} doc
 * @returns {{ edl: Edl, view: SavedView }}
 */
export function fromSavedDocument(doc) {
  return { edl: normalizeEdl(doc), view: viewOf(doc) };
}
