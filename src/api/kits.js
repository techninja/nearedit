/**
 * Brand kit routes: the library of kits with their logo and font files,
 * and the kit a project uses. Contract: docs/app-spec/BRAND-API.md.
 * The logic lives in ./kits/; handlers only translate HTTP.
 * @module api/kits
 */

import { Router } from 'express';
import { errorHandler } from './lib/httpErrors.js';
import { stringParam } from './lib/params.js';
import { kitErrors } from './kits/errors.js';
import { deleteKit, getKit, libraryFolder, listKits, putKit } from './kits/library.js';
import { chooseKit, describeProjectKit, projectFolder, projectKit } from './kits/project.js';
import { removeFile, saveFile } from './kits/upload.js';

export const kitsRouter = Router();

/** GET /api/kits — the built-in kits and the library's */
kitsRouter.get('/kits', (_req, res) => {
  res.json({ kits: listKits() });
});

/** GET /api/kits/:id — one kit: as stored, and resolved through its chain */
kitsRouter.get('/kits/:id', (req, res) => {
  res.json(getKit(req.params.id));
});

/** PUT /api/kits/:id — create or replace a kit of the library; body `{ kit }` */
kitsRouter.put('/kits/:id', (req, res) => {
  res.json(putKit(req.params.id, req.body?.kit));
});

/** DELETE /api/kits/:id — remove a kit of the library with its files */
kitsRouter.delete('/kits/:id', (req, res) => {
  deleteKit(req.params.id);
  res.status(204).end();
});

/** PUT /api/kits/:id/files/:name — the request's body becomes a logo or font file of the kit */
kitsRouter.put('/kits/:id/files/:name', async (req, res) => {
  res.json(await saveFile(req, libraryFolder(req.params.id), req.params.name));
});

/** DELETE /api/kits/:id/files/:name — remove a file of the kit */
kitsRouter.delete('/kits/:id/files/:name', (req, res) => {
  removeFile(libraryFolder(req.params.id), req.params.name);
  res.status(204).end();
});

/** GET /api/projects/:id/kit[?adaptation=] — the kit a project uses, resolved */
kitsRouter.get('/projects/:id/kit', (req, res) => {
  const adaptation = stringParam(req.query.adaptation);
  res.json(describeProjectKit(projectKit(req.params.id, adaptation)));
});

/** PUT /api/projects/:id/kit[?adaptation=] — `{ choice }` chooses a kit, `{ kit }` writes the project's own */
kitsRouter.put('/projects/:id/kit', (req, res) => {
  res.json(chooseKit(req.params.id, req.body, stringParam(req.query.adaptation)));
});

/** PUT /api/projects/:id/kit/files/:name — a logo or font file of the project's own kit */
kitsRouter.put('/projects/:id/kit/files/:name', async (req, res) => {
  res.json(await saveFile(req, projectFolder(req.params.id), req.params.name));
});

/** DELETE /api/projects/:id/kit/files/:name — remove a file of the project's own kit */
kitsRouter.delete('/projects/:id/kit/files/:name', (req, res) => {
  removeFile(projectFolder(req.params.id), req.params.name);
  res.status(204).end();
});

kitsRouter.use(kitErrors);
kitsRouter.use(errorHandler);
