/**
 * Media library — the open project's media list, loaded once and shared.
 * The media bin shows it, the timeline uses its durations to clamp trims,
 * the transcript panel and director look files up by path.
 * Shape of an item: MediaItem in docs/app-spec/API.md § Media.
 * @module utils/media/library
 */

import { api, query } from '#utils/api/http.js';

/** @typedef {{ filename: string, filePath: string, relativePath: string, type: 'video'|'audio'|'image'|'text', global: boolean, size: number, duration: number|null, width: number|null, height: number|null, fps: number|null, hasAudio: boolean, indexed: boolean, tags: string[], analysis: Record<string, boolean> }} MediaItem */

/** @type {MediaItem[]} */
let items = [];
/** @type {Map<string, MediaItem>} */
let byPath = new Map();
/** @type {Record<string, number>} */
let durations = {};
let projectId = '';
let loading = false;
let error = '';
/** @type {Set<() => void>} */
const listeners = new Set();

/** Tell subscribers that the library (or its loading state) changed. */
function notify() {
  for (const listener of listeners) listener();
}

/** @returns {MediaItem[]} Every media item of the open project */
export const getLibrary = () => items;

/**
 * @param {string} filePath - Absolute path
 * @returns {MediaItem|undefined}
 */
export const getMediaItem = (filePath) => byPath.get(filePath);

/**
 * Source durations keyed by absolute path, in the form the trim and slip
 * operations in `#utils/edl/` accept as `sourceDurations`.
 * @returns {Record<string, number>}
 */
export const sourceDurations = () => durations;

/** @returns {{ loading: boolean, error: string, projectId: string }} */
export const libraryStatus = () => ({ loading, error, projectId });

/**
 * Load (or reload) the media list of a project.
 * @param {string} [id] - Project id; omit to reload the current project
 * @returns {Promise<MediaItem[]>} Resolves with the items; on failure the
 *   previous list is kept and `libraryStatus().error` is set
 */
export async function loadLibrary(id = projectId) {
  projectId = id;
  loading = true;
  error = '';
  notify();
  try {
    const { data } = await api(`/media${query({ projectId: id })}`);
    if (projectId !== id) return items; // a newer load superseded this one
    items = data;
    byPath = new Map(items.map((item) => [item.filePath, item]));
    durations = Object.fromEntries(
      items.filter((item) => item.duration > 0).map((item) => [item.filePath, item.duration]),
    );
  } catch (err) {
    error = err.message;
  } finally {
    loading = false;
    notify();
  }
  return items;
}

/** Forget the library (leaving the editor). */
export function clearLibrary() {
  items = [];
  byPath = new Map();
  durations = {};
  projectId = '';
  error = '';
  notify();
}

/**
 * Subscribe to library changes.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onLibraryChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** MIME type used when dragging a media item from the bin to the timeline. */
export const MEDIA_DRAG_TYPE = 'application/x-nearedit-media';
