/**
 * Legacy `/api/assemble` — retired. The deterministic word-aligned assembly
 * it offered is now the `base_edit` action of `POST /api/director`
 * (docs/app-spec/DIRECTOR.md). The router is kept, empty, because
 * `src/server.js` still mounts it.
 * @module api/assemble
 */

import { Router } from 'express';

export const assembleRouter = Router();
