/**
 * Creating and (re-)registering projects.
 *
 * A project is self-contained in its folder, so "creating" one at a path
 * that already holds `.nearedit/project.json` simply registers what is
 * there — the file is never overwritten.
 * @module api/projects/create
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { HttpError, assertValid } from '../lib/httpErrors.js';
import {
  loadRegistry,
  projectFilePath,
  readProjectAt,
  saveRegistry,
  writeJsonAtomic,
} from '../lib/registry.js';
import { emptyEdl } from './adaptations.js';
import { ASPECT_RESOLUTIONS } from './adaptationFields.js';
import { cleanFolderPath, cleanName } from './projectFields.js';
import { publicProject } from './store.js';

/** Ids are used as registry keys and in URLs. */
const SAFE_ID = /^(?!__proto__$)[\w-]{1,64}$/;

/**
 * @param {string} [name]
 * @returns {object} A root 16:9 adaptation with an empty timeline
 */
function defaultAdaptation(name = 'Main Edit') {
  const now = new Date().toISOString();
  const resolution = ASPECT_RESOLUTIONS['16:9'];
  return {
    id: randomUUID(),
    name,
    parentAdaptationId: '',
    aspectRatio: '16:9',
    resolution,
    fps: 30,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    edl: emptyEdl(resolution, 30),
  };
}

/**
 * Make a project file found on disk usable: it needs an id, a name and at
 * least one adaptation with an id. Everything else is left as it was.
 * @param {any} project - Mutated in place
 * @param {string} dir
 * @returns {boolean} true when something had to be repaired
 */
function repair(project, dir) {
  const before = JSON.stringify([project.id, project.name, project.adaptations?.map((a) => a?.id)]);
  if (typeof project.id !== 'string' || !SAFE_ID.test(project.id)) project.id = randomUUID();
  if (typeof project.name !== 'string' || !project.name) project.name = basename(dir);
  const usable = Array.isArray(project.adaptations)
    ? project.adaptations.filter((a) => a && typeof a === 'object')
    : [];
  project.adaptations = usable.length ? usable : [defaultAdaptation()];
  for (const adaptation of project.adaptations) {
    if (typeof adaptation.id !== 'string' || !adaptation.id) adaptation.id = randomUUID();
  }
  return (
    before !== JSON.stringify([project.id, project.name, project.adaptations.map((a) => a.id)])
  );
}

/**
 * Point the registry at a project folder.
 * @param {any} project - May receive a new id when the folder is a copy of a registered project
 * @param {string} dir
 * @returns {boolean} true when the project's id was changed
 */
function register(project, dir) {
  const registry = loadRegistry();
  const holder = registry[project.id];
  const elsewhere = typeof holder?.path === 'string' && resolve(holder.path) !== dir;
  // The same id registered at another folder that still has its project file
  // means this folder was copied; the copy becomes a project of its own.
  const isCopy = elsewhere && readProjectAt(holder.path)?.id === project.id;
  if (isCopy) project.id = randomUUID();
  for (const [id, entry] of Object.entries(registry)) {
    if (typeof entry?.path === 'string' && resolve(entry.path) === dir) delete registry[id];
  }
  registry[project.id] = { path: dir, name: project.name };
  saveRegistry(registry);
  return isCopy;
}

/**
 * Create a project at a folder, or register the one already there.
 * @param {any} body - `{ name, path }`; `name` is only needed for a new project
 * @returns {object} The public project
 * @throws {HttpError} 422 invalid fields, 403 outside the browse roots, 409 unreadable project file
 */
export function createProject(body) {
  const input = body && typeof body === 'object' ? body : {};
  const dir = cleanFolderPath(input.path, 'path');
  if (existsSync(dir) && !statSync(dir).isDirectory()) assertValid({ path: 'Not a folder' });
  const file = projectFilePath(dir);

  if (existsSync(file)) {
    const project = readProjectAt(dir);
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      const detail = file;
      throw new HttpError(409, 'A project file exists at this path but cannot be read', { detail });
    }
    const repaired = repair(project, dir);
    const renumbered = register(project, dir);
    if (repaired || renumbered) writeJsonAtomic(file, project);
    return publicProject(project, dir);
  }

  const name = cleanName(input.name);
  if (!name) assertValid({ name: 'name is required' });
  const now = new Date().toISOString();
  const project = {
    id: randomUUID(),
    name,
    description: '',
    status: 'active',
    mediaFolders: [],
    adaptations: [defaultAdaptation()],
    createdAt: now,
    updatedAt: now,
  };
  try {
    mkdirSync(dir, { recursive: true });
    writeJsonAtomic(file, project);
  } catch (err) {
    if (!['EACCES', 'EPERM', 'EROFS'].includes(err.code)) throw err;
    throw new HttpError(403, 'The server is not allowed to write to this folder', { detail: dir });
  }
  register(project, dir);
  return publicProject(project, dir);
}
