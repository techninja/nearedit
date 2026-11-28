/**
 * The kit routes of the server, one function each (docs/app-spec/BRAND.md
 * § Where kits live): the library of kits, a project's choice of kit and
 * its own kit, and the logo and font files a kit brings. `:id` is a
 * library id or a built-in as `builtin:clean`.
 * @module utils/brandUi/kitApi
 */

import { ApiError, api, query } from '#utils/api/http.js';

/**
 * A kit as the list shows it.
 * @typedef {Object} KitEntry
 * @property {string} id - A library id, or `builtin:<name>`
 * @property {string} name
 * @property {string} description
 * @property {'builtin'|'library'} source
 * @property {string} extends
 * @property {string} key
 * @property {Record<string, string>} colors - background, surface, primary, accent, text
 * @property {number} elements
 * @property {number} problems
 */

/**
 * What the server says about one kit, or about a project's kit.
 * @typedef {Object} KitAnswer
 * @property {string} [id] - A library kit or a built-in
 * @property {string} [source]
 * @property {string} [choice] - A project: the kit it chose, or `project`
 * @property {any} kit - As stored
 * @property {import('#utils/brand/types.js').Kit} effective - Resolved through its chain
 * @property {string} key
 * @property {string[]} chain
 * @property {{ name: string, size: number }[]} files
 * @property {{ path: string, message: string, level?: string }[]} problems
 */

const enc = encodeURIComponent;

/** @returns {Promise<KitEntry[]>} Built-in and library kits */
export const listKits = async () => (await api('/kits')).kits || [];

/** @param {string} id @returns {Promise<KitAnswer>} */
export const readKit = (id) => api(`/kits/${enc(id)}`);

/**
 * Store a library kit.
 * @param {string} id
 * @param {any} kit
 * @returns {Promise<KitAnswer>}
 * @throws {ApiError} 422 with `body.problems` when it does not validate
 */
export const writeKit = (id, kit) => api(`/kits/${enc(id)}`, { method: 'PUT', body: { kit } });

/** @param {string} id @returns {Promise<null>} */
export const removeKit = (id) => api(`/kits/${enc(id)}`, { method: 'DELETE' });

/**
 * The kit a project uses — or, with an adaptation, the kit that
 * adaptation uses (its own choice when it has one, else the project's).
 * @param {string} projectId
 * @param {string} [adaptationId]
 * @returns {Promise<KitAnswer>}
 */
export const readProjectKit = (projectId, adaptationId = '') =>
  api(`/projects/${enc(projectId)}/kit${query({ adaptation: adaptationId })}`);

/**
 * Choose a kit for a project: a library id, `builtin:<name>`, or `project`.
 * @param {string} projectId
 * @param {string} choice - '' un-chooses
 * @param {string} [adaptationId] - Choose for this adaptation only ('' there:
 *   it goes with the project again)
 * @returns {Promise<KitAnswer>}
 */
export const chooseProjectKit = (projectId, choice, adaptationId = '') =>
  api(`/projects/${enc(projectId)}/kit${query({ adaptation: adaptationId })}`, {
    method: 'PUT',
    body: { choice },
  });

/**
 * Write the project's own kit and choose it.
 * @param {string} projectId
 * @param {any} kit
 * @returns {Promise<KitAnswer>}
 * @throws {ApiError} 422 with `body.problems` when it does not validate
 */
export const writeProjectKit = (projectId, kit) =>
  api(`/projects/${enc(projectId)}/kit`, { method: 'PUT', body: { kit } });

/**
 * Where a kit's files are sent: the library kit `id`, or a project's own kit.
 * @param {{ kitId?: string, projectId?: string }} owner
 * @returns {string} Path under `/api`, without the file name
 */
export const filesPath = ({ kitId, projectId }) =>
  kitId ? `/kits/${enc(kitId)}/files` : `/projects/${enc(projectId)}/kit/files`;

/**
 * Send a logo or a font file to a kit.
 * @param {{ kitId?: string, projectId?: string }} owner
 * @param {string} name - File name; the server may reduce it to a safe one
 * @param {Blob} bytes
 * @returns {Promise<{ name: string, size: number }>} The name it was stored under
 * @throws {ApiError}
 */
export async function uploadKitFile(owner, name, bytes) {
  const res = await fetch(`/api${filesPath(owner)}/${enc(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new ApiError(data?.error || `Upload failed (${res.status})`, res.status, data);
  return data;
}

/**
 * @param {{ kitId?: string, projectId?: string }} owner
 * @param {string} name
 * @returns {Promise<null>}
 */
export const removeKitFile = (owner, name) =>
  api(`${filesPath(owner)}/${enc(name)}`, { method: 'DELETE' });
