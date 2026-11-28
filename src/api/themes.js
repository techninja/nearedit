/**
 * Theme routes: the built-in themes and the library of themes, each a
 * Design Tokens file, and reading a theme out of a file someone brings.
 * Contract: docs/app-spec/THEMES.md § Routes. The logic lives in
 * ./themes/; handlers only translate HTTP.
 * @module api/themes
 */

import { Router } from 'express';
import { TOKENS_SUFFIX, TOKENS_TYPE } from '#utils/theme/designTokens.js';
import { printTokens } from '#utils/theme/tokens/print.js';
import { errorHandler } from './lib/httpErrors.js';
import { themeErrors } from './themes/errors.js';
import { deleteTheme, getTheme, listThemes } from './themes/library.js';
import { importTheme, putTheme } from './themes/write.js';

export const themesRouter = Router();

/** GET /api/themes — the built-in themes and the library's */
themesRouter.get('/themes', (_req, res) => {
  res.json({ themes: listThemes() });
});

/** POST /api/themes/import — `{ text }`: the theme a Base16 or Design Tokens file would be */
themesRouter.post('/themes/import', (req, res) => {
  const answer = importTheme(req.body);
  res.status(answer.stored ? 201 : 200).json(answer);
});

/** GET /api/themes/:id — one theme: as written, resolved, and as custom properties */
themesRouter.get('/themes/:id', (req, res) => {
  res.json(getTheme(req.params.id));
});

/** GET /api/themes/:id/tokens — the theme's Design Tokens file, to download */
themesRouter.get('/themes/:id/tokens', (req, res) => {
  const { id, tokens } = getTheme(req.params.id);
  res.set('Content-Disposition', `attachment; filename="${id}${TOKENS_SUFFIX}"`);
  res.type(TOKENS_TYPE).send(printTokens(tokens));
});

/** PUT /api/themes/:id — create or replace a theme of the library; body `{ theme }` or `{ tokens }` */
themesRouter.put('/themes/:id', (req, res) => {
  res.json(putTheme(req.params.id, req.body));
});

/** DELETE /api/themes/:id — remove a theme of the library */
themesRouter.delete('/themes/:id', (req, res) => {
  deleteTheme(req.params.id);
  res.status(204).end();
});

themesRouter.use(themeErrors);
themesRouter.use(errorHandler);
