/**
 * Director routes — the assistant editor. Turns a directive into a
 * DirectorResult fragment (or script options) inside a background job.
 * Contract: docs/app-spec/API.md § Director. Logic lives in ./director/.
 * @module api/director
 */

import { Router } from 'express';
import { ACTIONS } from '#utils/director/actions.js';
import { errorResponse, unavailable } from './director/errors.js';
import { createLlmClient } from './director/llm/client.js';
import { precheck, prepareRequest } from './director/request.js';
import { jobLabel, runDirective, usesLlm } from './director/run.js';
import { runJob } from './lib/jobRunner.js';

export const directorRouter = Router();

/**
 * Validate the request, check the LLM when the action needs it, start the
 * job and answer `202 { jobId }`.
 * @param {'director'|'script'} route
 * @returns {import('express').RequestHandler}
 */
function start(route) {
  return async (req, res) => {
    try {
      const prepared = prepareRequest(req.body, route);
      await precheck(prepared);
      const llm = createLlmClient();
      if (prepared.action.llm === 'yes') {
        const status = await llm.available();
        if (!status.available)
          throw unavailable(
            llm.enabled
              ? `The ${llm.provider} LLM (${llm.model}) is not reachable`
              : 'No LLM provider is configured',
            status.detail,
          );
      }
      const { directive, action } = prepared;
      const job = runJob(
        action.jobType,
        { action: action.id, mode: directive.mode, adaptationId: prepared.adaptationId },
        {
          projectId: prepared.projectId,
          label: jobLabel(prepared),
          lane: usesLlm(prepared) ? 'llm' : 'default',
        },
        (ctx) => runDirective(prepared, llm, ctx),
      );
      res.status(202).json({ jobId: job.id });
    } catch (err) {
      const { status, body } = errorResponse(err);
      if (status >= 500 && status !== 503) console.error('[director]', err);
      res.status(status).json(body);
    }
  };
}

/** GET /api/director/actions — the action schemas that drive the director form */
directorRouter.get('/director/actions', (_req, res) => {
  res.json({ data: ACTIONS });
});

/** POST /api/director — { projectId, adaptationId, directive, edl } → 202 { jobId } */
directorRouter.post('/director', start('director'));

/** POST /api/director/script — same body; the job result is { scripts: [...] } */
directorRouter.post('/director/script', start('script'));
