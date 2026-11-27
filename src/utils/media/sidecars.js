/**
 * Sidecar cache — the analysis data of media files (transcript, tags,
 * scenes…), fetched once per file and shared by the media bin's quick look
 * and the transcript panel. Routes: docs/app-spec/API.md § Media.
 * @module utils/media/sidecars
 */

import { api, query } from '#utils/api/http.js';

/** @type {Map<string, Promise<Record<string, any>|null>>} */
const cache = new Map();
/** @type {Set<(path: string) => void>} */
const listeners = new Set();

/**
 * Tell subscribers that a file's sidecar (or with '', every sidecar) changed.
 * @param {string} path
 */
function notify(path) {
  for (const listener of listeners) listener(path);
}

/**
 * The sidecar of a media file.
 * @param {string} path - Absolute path
 * @param {{ refresh?: boolean }} [opts] - `refresh` skips the cache
 * @returns {Promise<Record<string, any>|null>} null when the file has not
 *   been analysed (or its analysis is stale)
 */
export function loadSidecar(path, opts = {}) {
  if (!path) return Promise.resolve(null);
  if (!opts.refresh && cache.has(path)) return cache.get(path);
  const request = api(`/sidecar${query({ path })}`).then((data) =>
    data && data.exists !== false ? data : null,
  );
  cache.set(path, request);
  request.catch(() => {
    if (cache.get(path) === request) cache.delete(path); // let the next caller retry
  });
  return request;
}

/**
 * Merge a patch into a file's sidecar on the server (user edits to tags or
 * transcript) and refresh the cache with the stored result.
 * @param {string} path
 * @param {Record<string, any>} patch
 * @returns {Promise<Record<string, any>>} The whole updated sidecar
 * @throws {import('#utils/api/http.js').ApiError} when the server rejects the patch
 */
export async function saveSidecar(path, patch) {
  const saved = await api(`/sidecar${query({ path })}`, { method: 'PUT', body: patch });
  cache.set(path, Promise.resolve(saved));
  notify(path);
  return saved;
}

/**
 * Drop cached sidecars after analysis ran, so the next read is fresh.
 * @param {string} [path] - One file; every file when omitted
 */
export function forgetSidecars(path = '') {
  if (path) cache.delete(path);
  else cache.clear();
  notify(path);
}

/**
 * Subscribe to sidecar changes.
 * @param {(path: string) => void} listener - Gets the path, or '' for "all"
 * @returns {() => void} unsubscribe
 */
export function onSidecarChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
