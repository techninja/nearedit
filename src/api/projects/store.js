/**
 * Project reads and updates on top of lib/registry.js. A project is the file
 * `<project-dir>/.nearedit/project.json`; the registry only remembers where
 * each one lives. All functions are synchronous on purpose: a read-modify-
 * write of the project file can then never interleave with another request.
 * @module api/projects/store
 */

import { basename } from 'node:path';
import { HttpError } from '../lib/httpErrors.js';
import {
  getProjectDir,
  loadRegistry,
  readProjectAt,
  saveRegistry,
  writeProject,
} from '../lib/registry.js';
import { publicAdaptation } from './adaptations.js';
import { cleanProjectFields } from './projectFields.js';

/**
 * Load a registered project.
 * @param {string} projectId
 * @returns {{ project: any, dir: string }}
 * @throws {HttpError} 404 when not registered or its file is gone
 */
export function requireProject(projectId) {
  const dir = getProjectDir(projectId);
  if (typeof dir !== 'string' || !dir) throw new HttpError(404, 'Project not found');
  const project = readProjectAt(dir);
  if (!project || typeof project !== 'object') {
    throw new HttpError(404, 'Project file not found on disk', { detail: dir });
  }
  return { project, dir };
}

/**
 * Persist a project, stamping its modification time.
 * @param {string} projectId
 * @param {any} project
 */
export function saveProject(projectId, project) {
  project.id = projectId;
  project.updatedAt = new Date().toISOString();
  writeProject(projectId, project);
}

/**
 * The project as API clients see it (adaptations without their EDLs).
 * @param {any} project - Contents of the project file
 * @param {string} dir - Where it lives
 * @param {string} [projectId] - Registry id, when it should win over the file's
 * @returns {object}
 */
export function publicProject(project, dir, projectId = project.id) {
  const adaptations = Array.isArray(project.adaptations) ? project.adaptations : [];
  return {
    id: projectId,
    name: project.name || basename(dir),
    description: project.description || '',
    status: project.status || 'active',
    path: dir,
    available: true,
    mediaFolders: Array.isArray(project.mediaFolders) ? project.mediaFolders : [],
    adaptations: adaptations.map((a) => publicAdaptation(a, projectId)),
    createdAt: project.createdAt || '',
    updatedAt: project.updatedAt || project.createdAt || '',
  };
}

/**
 * Every registered project. One whose folder cannot be read right now (an
 * unplugged drive, say) is still listed, flagged `available: false`.
 * @returns {object[]}
 */
export function listProjects() {
  return Object.entries(loadRegistry())
    .filter(([, entry]) => typeof entry?.path === 'string' && entry.path)
    .map(([id, entry]) => {
      const project = readProjectAt(entry.path);
      if (project && typeof project === 'object') return publicProject(project, entry.path, id);
      const name = entry.name || basename(entry.path);
      return { ...publicProject({ name }, entry.path, id), available: false };
    });
}

/**
 * Shallow-merge an update. Only name, description, mediaFolders and status
 * can be changed this way.
 * @param {string} projectId
 * @param {any} body
 * @returns {object} The updated public project
 */
export function updateProject(projectId, body) {
  const { project, dir } = requireProject(projectId);
  const changes = cleanProjectFields(body, project);
  Object.assign(project, changes);
  saveProject(projectId, project);
  if (changes.name) {
    const registry = loadRegistry();
    registry[projectId] = { ...registry[projectId], name: changes.name };
    saveRegistry(registry);
  }
  return publicProject(project, dir, projectId);
}

/**
 * Forget a project. Its folder and project file are left untouched, so it
 * can be registered again later.
 * @param {string} projectId
 * @throws {HttpError} 404 when not registered
 */
export function unregisterProject(projectId) {
  const registry = loadRegistry();
  if (!Object.hasOwn(registry, projectId)) throw new HttpError(404, 'Project not found');
  delete registry[projectId];
  saveRegistry(registry);
}
