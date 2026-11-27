/**
 * Server-side folder browser — lets the UI pick project and media folders
 * on a headless server where no native dialog exists.
 * Contract: docs/app-spec/API.md § Folder browser.
 * @module api/browse
 */

import { Router } from 'express';

export const browseRouter = Router();

/** GET /api/browse?path= — list sub-directories (implemented by the server-platform work) */
browseRouter.get('/browse', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
