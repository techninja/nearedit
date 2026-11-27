/**
 * `generate_edit` — the LLM writes an edit plan (segment picks); the plan
 * is validated, resolved to real media and assembled deterministically.
 * @module api/director/actions/generateEdit
 */

import { formatSeconds } from '#utils/director/snap.js';
import { buildDigest } from '../context/digest.js';
import { DirectorError } from '../errors.js';
import { assembleResult } from '../pipeline.js';
import { requestPlan } from '../plan/request.js';
import { resolvePlan } from '../plan/resolve.js';
import { editPlanPrompt } from '../prompts/editPlan.js';

/** @typedef {import('../pipeline.js').ActionContext} ActionContext */

/**
 * Extra plan check: at least one pick must name a real file.
 * @param {import('../context/mediaInfo.js').MediaInfo[]} media
 * @returns {(plan: any) => string[]}
 */
export function usesKnownFiles(media) {
  return (plan) =>
    resolvePlan(plan, media).picks.length
      ? []
      : [
          `none of the picks names a file from the media list — use the handles ` +
            `m1 to m${media.length} exactly as listed`,
        ];
}

/**
 * Ask the LLM for a plan and assemble it. Shared by `generate_edit` and
 * `execute_script`, which differ only in their prompt.
 * @param {ActionContext} ctx
 * @param {{ system: string, user: string }} prompt
 * @param {string[]} notes - Notes to put first
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function planAndAssemble(ctx, prompt, notes) {
  const { llm, media } = ctx;
  ctx.progress(15, `Asking ${llm.model} for an edit plan…`);
  let lastReport = 0;
  const asked = await requestPlan({
    llm,
    ...prompt,
    check: usesKnownFiles(media),
    signal: ctx.signal,
    log: ctx.log,
    onProgress: (chars, attempt) => {
      if (Date.now() - lastReport < 750) return;
      lastReport = Date.now();
      const percent = Math.min(80, (attempt === 1 ? 15 : 55) + chars / 60);
      ctx.progress(
        percent,
        `${attempt === 1 ? 'Writing' : 'Correcting'} the plan… ${chars} characters`,
      );
    },
  });
  ctx.progress(
    85,
    `Plan received: ${asked.plan.picks.length} picks — assembling on word, shot and beat boundaries`,
  );
  return assembleResult(asked.plan, ctx, { notes: [...notes, ...asked.notes] });
}

/**
 * @param {ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function generateEdit(ctx) {
  const { directive, media } = ctx;
  if (!media.length)
    throw new DirectorError('This project has no media yet', {
      status: 422,
      detail: 'Add video, audio or image files to the project folder and analyse them.',
    });
  const digest = buildDigest(media, { focus: directive.prompt });
  const notes = [];
  if (digest.hidden)
    notes.push(
      `${digest.hidden} files did not fit in the prompt and were not offered to the model.`,
    );
  const result = await planAndAssemble(
    ctx,
    editPlanPrompt({ digest: digest.text, directive, format: ctx.format }),
    notes,
  );
  const target = directive.params.duration;
  if (result.duration > target * 1.3 || result.duration < target * 0.6)
    result.notes.push(
      `The edit runs ${formatSeconds(result.duration)} against a target of ${formatSeconds(target)}.`,
    );
  return result;
}
