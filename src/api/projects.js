/**
 * Project, adaptation and EDL routes. Contract: docs/app-spec/API.md § Projects.
 * The logic lives in ./projects/; handlers only translate HTTP.
 * @module api/projects
 */

import { Router } from 'express';
import { errorHandler } from './lib/httpErrors.js';
import {
  addAdaptation,
  patchAdaptation,
  publicAdaptation,
  removeAdaptation,
} from './projects/adaptations.js';
import { createProject } from './projects/create.js';
import { readEdl, replaceEdl } from './projects/edl.js';
import {
  listProjects,
  publicProject,
  requireProject,
  saveProject,
  unregisterProject,
  updateProject,
} from './projects/store.js';

export const projectsRouter = Router();

/** GET /api/projects — every registered project */
projectsRouter.get('/projects', (_req, res) => {
  const data = listProjects();
  res.json({ data, total: data.length });
});

/** POST /api/projects — create a project at a folder, or register the one already there */
projectsRouter.post('/projects', (req, res) => {
  res.status(201).json(createProject(req.body));
});

/** GET /api/projects/:id — one project with its adaptations */
projectsRouter.get('/projects/:id', (req, res) => {
  const { project, dir } = requireProject(req.params.id);
  res.json(publicProject(project, dir, req.params.id));
});

/** PUT /api/projects/:id — update name, description, mediaFolders, status */
projectsRouter.put('/projects/:id', (req, res) => {
  res.json(updateProject(req.params.id, req.body));
});

/** DELETE /api/projects/:id — unregister; files stay on disk */
projectsRouter.delete('/projects/:id', (req, res) => {
  unregisterProject(req.params.id);
  res.status(204).end();
});

/** POST /api/projects/:id/adaptations — add an adaptation, optionally copying another's EDL */
projectsRouter.post('/projects/:id/adaptations', (req, res) => {
  const { project } = requireProject(req.params.id);
  const adaptation = addAdaptation(project, req.body);
  saveProject(req.params.id, project);
  res.status(201).json(publicAdaptation(adaptation, req.params.id));
});

/** PUT /api/projects/:id/adaptations/:aid — update an adaptation's settings */
projectsRouter.put('/projects/:id/adaptations/:aid', (req, res) => {
  const { project } = requireProject(req.params.id);
  const adaptation = patchAdaptation(project, req.params.aid, req.body);
  saveProject(req.params.id, project);
  res.json(publicAdaptation(adaptation, req.params.id));
});

/** DELETE /api/projects/:id/adaptations/:aid — remove one; its children move up a level */
projectsRouter.delete('/projects/:id/adaptations/:aid', (req, res) => {
  const { project } = requireProject(req.params.id);
  removeAdaptation(project, req.params.aid);
  saveProject(req.params.id, project);
  res.status(204).end();
});

/** GET /api/projects/:id/edl/:aid — the adaptation's timeline document */
projectsRouter.get('/projects/:id/edl/:aid', (req, res) => {
  res.json(readEdl(req.params.id, req.params.aid));
});

/** PUT /api/projects/:id/edl/:aid — replace the timeline document */
projectsRouter.put('/projects/:id/edl/:aid', (req, res) => {
  res.json(replaceEdl(req.params.id, req.params.aid, req.body));
});

projectsRouter.use(errorHandler);
