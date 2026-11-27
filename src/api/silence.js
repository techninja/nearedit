/**
 * Legacy `/api/silence/*` — retired. Silence removal is now the
 * `remove_silence` action of `POST /api/director`, which works on the
 * timeline itself and keeps linked picture and sound together
 * (docs/app-spec/DIRECTOR.md); transcript search is `GET /api/index/search`.
 * The router is kept, empty, because `src/server.js` still mounts it.
 * @module api/silence
 */

import { Router } from 'express';

export const silenceRouter = Router();
