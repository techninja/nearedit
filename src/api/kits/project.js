/**
 * A project's kit. A project names the kit it uses in its project file
 * (`kit`: a library id, `builtin:<name>`, or `project` for the kit in
 * `<project>/.nearedit/kit/`); with nothing chosen it is `builtin:clean`.
 * An adaptation may name another (`adaptation.kit`) and goes with the
 * project's otherwise. `projectKit` is what the editor's routes and the
 * director read a project's brand from.
 * Contract: docs/app-spec/BRAND-API.md § A project's kit.
 * @module api/kits/project
 */

import { HttpError } from '../lib/httpErrors.js';
import { projectFactsOf } from '../lib/mediaFolders.js';
import { getProjectDir } from '../lib/registry.js';
import { findAdaptation } from '../projects/adaptations.js';
import { requireProject, saveProject } from '../projects/store.js';
import { FALLBACK, openKit, projectKitDir } from './chain.js';
import { effectiveKit } from './effective.js';
import { InvalidKit } from './errors.js';
import { listFiles } from './files.js';
import { PROJECT_CHOICE } from './limits.js';
import { parseRef } from './names.js';
import { writeKit } from './store.js';

/** @typedef {import('./effective.js').Resolved} Resolved */

/**
 * A project's kit, resolved.
 * @typedef {Resolved & { choice: string, projectDir: string }} ProjectKit - `choice`
 *   is what the project (or the adaptation) names: a library id,
 *   `builtin:<name>` or `project`
 */

/**
 * The effective kit of a project, or of one of its adaptations.
 * @param {string} projectId
 * @param {string} [adaptationId] - An adaptation that may have chosen a kit of its own
 * @returns {ProjectKit} Always usable: a chosen kit that is gone falls back
 *   to `builtin:clean`, with a problem at `choice`
 * @throws {HttpError} 404 for an unknown project or adaptation
 */
export function projectKit(projectId, adaptationId = '') {
  const projectDir = getProjectDir(projectId);
  const facts = typeof projectDir === 'string' && projectDir ? projectFactsOf(projectDir) : null;
  if (!facts) throw new HttpError(404, 'Project not found');
  if (adaptationId && !Object.hasOwn(facts.adaptationKits, adaptationId)) {
    throw new HttpError(404, 'Adaptation not found');
  }
  const named = (adaptationId && facts.adaptationKits[adaptationId]) || facts.kit;
  const choice = parseRef(named)?.ref || FALLBACK;
  return { ...effectiveKit(choice, projectDir), choice, projectDir };
}

/**
 * A project's kit as `GET /projects/:id/kit` answers. `files` are those of
 * the project's own kit folder, whichever kit is chosen: they are what the
 * file routes beside this one put there.
 * @param {ProjectKit} found
 * @returns {object}
 */
export function describeProjectKit(found) {
  const { choice, ref: id, source, kit, effective, key, chain, problems, projectDir } = found;
  const files = listFiles(projectKitDir(projectDir));
  return { choice, id, source, kit, effective, key, chain, files, problems };
}

/**
 * The folder of a project's own kit, for its files to be changed.
 * @param {string} projectId
 * @returns {string}
 * @throws {HttpError} 404 for an unknown project
 */
export function projectFolder(projectId) {
  return projectKitDir(requireProject(projectId).dir);
}

/**
 * Choose a project's kit, or write its own kit and choose that.
 * @param {string} projectId
 * @param {any} body - `{ choice }`: a library id, `builtin:<name>`,
 *   `project`, or '' for none; or `{ kit }`: the project's own kit
 * @param {string} [adaptationId] - Choose for this adaptation only
 * @returns {object} As `describeProjectKit`
 * @throws {HttpError} 404 unknown project or adaptation, 400 neither field,
 *   413, 422 (`InvalidKit`) for a kit that does not validate or a choice
 *   that names no kit
 */
export function chooseKit(projectId, body, adaptationId = '') {
  const { project, dir } = requireProject(projectId);
  const holder = adaptationId ? findAdaptation(project, adaptationId) : project;
  const input = body && typeof body === 'object' ? body : {};
  let written = null;
  let choice = PROJECT_CHOICE;
  if (input.kit !== undefined) {
    written = writeKit(parseRef(PROJECT_CHOICE), projectKitDir(dir), input.kit);
  } else if (input.choice === '' || input.choice === null) {
    choice = '';
  } else if (input.choice !== undefined) {
    const ref = parseRef(input.choice);
    if (!openKit(ref, dir)) {
      const message =
        ref?.source === 'project'
          ? 'The project has no kit of its own yet: send { kit } to write one'
          : `There is no kit ${JSON.stringify(input.choice)}`;
      throw new InvalidKit([{ path: 'choice', message, level: 'error' }], 'No such kit');
    }
    choice = ref.ref;
  } else {
    throw new HttpError(400, 'choice or kit required');
  }
  if ((holder.kit || '') !== choice) {
    if (choice) holder.kit = choice;
    else delete holder.kit;
    saveProject(projectId, project);
  }
  const described = describeProjectKit(projectKit(projectId, adaptationId));
  return written ? { ...described, problems: written.problems } : described;
}
