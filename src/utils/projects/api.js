/**
 * API calls of the home and project pages — projects, adaptations, folders,
 * providers, renders. Thin wrappers so components never build URLs.
 * Contract: docs/app-spec/API.md (shapes as implemented in src/api/**).
 * @module utils/projects/api
 */

import { api, query } from '#utils/api/http.js';

/**
 * @typedef {Object} Adaptation
 * @property {string} id
 * @property {string} projectId
 * @property {string} parentAdaptationId - '' for a root adaptation
 * @property {string} name
 * @property {string} aspectRatio
 * @property {string} resolution - "WxH"
 * @property {number} fps
 * @property {string} status - draft | review | final | rendered
 * @property {string} updatedAt
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} path - Project folder on the server
 * @property {boolean} available - false when the folder cannot be read right now
 * @property {string[]} mediaFolders
 * @property {Adaptation[]} adaptations
 * @property {string} updatedAt
 * @typedef {{ name: string, path: string, hasProject: boolean }} FolderEntry
 * @typedef {{ path: string, parent: string|null, roots: string[], hasProject: boolean,
 *   dirs: FolderEntry[] }} FolderListing
 */

/** @returns {Promise<Project[]>} */
export const listProjects = async () => (await api('/projects')).data;

/** @param {string} id @returns {Promise<Project>} */
export const getProject = (id) => api(`/projects/${encodeURIComponent(id)}`);

/**
 * Create a project at a folder, or register the one already there.
 * @param {{ name: string, path: string }} body
 * @returns {Promise<Project>}
 */
export const createProject = (body) => api('/projects', { body });

/**
 * @param {string} id
 * @param {{ name?: string, description?: string, mediaFolders?: string[] }} patch
 * @returns {Promise<Project>}
 */
export const updateProject = (id, patch) =>
  api(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: patch });

/** Unregister a project; its files stay on disk. @param {string} id @returns {Promise<null>} */
export const removeProject = (id) =>
  api(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * @param {string} projectId
 * @param {object} body - name, aspectRatio, resolution, fps, parentAdaptationId?, copyFrom?
 * @returns {Promise<Adaptation>}
 */
export const createAdaptation = (projectId, body) =>
  api(`/projects/${encodeURIComponent(projectId)}/adaptations`, { body });

/**
 * @param {string} projectId
 * @param {string} adaptationId
 * @param {object} body - Any of name, aspectRatio, resolution, fps, status
 * @returns {Promise<Adaptation>}
 */
export const updateAdaptation = (projectId, adaptationId, body) =>
  api(
    `/projects/${encodeURIComponent(projectId)}/adaptations/${encodeURIComponent(adaptationId)}`,
    {
      method: 'PUT',
      body,
    },
  );

/**
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {Promise<null>}
 */
export const deleteAdaptation = (projectId, adaptationId) =>
  api(
    `/projects/${encodeURIComponent(projectId)}/adaptations/${encodeURIComponent(adaptationId)}`,
    {
      method: 'DELETE',
    },
  );

/** @param {string} [path] - Omit for the first browse root @returns {Promise<FolderListing>} */
export const browseFolder = (path) => api(`/browse${query({ path })}`);

/**
 * @param {string} path - Parent folder
 * @param {string} name
 * @returns {Promise<{ path: string }>}
 */
export const makeFolder = (path, name) => api('/browse/mkdir', { body: { path, name } });

/**
 * Open the server machine's own folder dialog.
 * @returns {Promise<{ path: string, browsable: boolean }|null>} null when the server has no
 *   desktop, the browser is on another machine, or nothing was chosen
 */
export const pickNativeFolder = () => api('/pick-folder', { method: 'POST' });

/** @returns {Promise<any>} Provider status, see API.md § Intelligence */
export const getProviderStatus = () => api('/intelligence/status');

/** @param {string} projectId @returns {Promise<any[]>} Finished renders, newest first */
export const listRenders = async (projectId) => (await api(`/renders${query({ projectId })}`)).data;

/** @param {string} file - Render file name @returns {Promise<null>} */
export const deleteRender = (file) =>
  api(`/render/file/${encodeURIComponent(file)}`, { method: 'DELETE' });
