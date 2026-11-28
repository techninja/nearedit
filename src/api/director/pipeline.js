/**
 * The shared back half of every plan-based action:
 * edit plan → resolve to real media → assemble → DirectorResult.
 * `generate_edit` and `execute_script` get their plan from the LLM,
 * `base_edit` from heuristics; from here on they are the same.
 * @module api/director/pipeline
 */

import { assemblePlan } from './assemble/index.js';
import { assembleOptions } from './assemble/options.js';
import { kitOf } from './brand/kit.js';
import { DirectorError } from './errors.js';
import { describePlan } from './plan/describe.js';
import { resolvePlan } from './plan/resolve.js';
import { directorResult } from './result.js';

/**
 * @typedef {import('./context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {Object} ActionContext
 * @property {string} projectId
 * @property {string} projectDir
 * @property {import('#utils/director/directive.js').Directive} directive
 * @property {any} edl - The posted timeline document, or null
 * @property {{ fps: number, width: number, height: number, aspectRatio: string, name: string }} format
 * @property {MediaInfo[]} media - Every media file of the project
 * @property {import('#utils/brand/types.js').Kit} [kit] - The project's
 *   effective brand kit; `kitOf(ctx)` gives the built-in one without it
 * @property {import('./llm/client.js').LlmClient} llm
 * @property {AbortSignal} [signal]
 * @property {(percent: number, message?: string) => void} progress
 * @property {(message: string) => void} log
 */

/**
 * Picture material that auto b-roll may draw on: project footage and stills
 * the plan does not already use.
 * @param {MediaInfo[]} media
 * @param {import('./plan/resolve.js').ResolvedPlan} plan
 * @returns {MediaInfo[]}
 */
export function brollPool(media, plan) {
  const used = new Set(
    plan.picks.flatMap((p) => [p.media.filePath, ...p.visuals.map((v) => v.media.filePath)]),
  );
  return media.filter(
    (m) => !m.global && (m.kind === 'picture' || m.kind === 'still') && !used.has(m.filePath),
  );
}

/**
 * Resolve and assemble a schema-valid plan into a bare fragment.
 * @param {any} plan - Valid against PLAN_SCHEMA
 * @param {ActionContext} ctx
 * @param {Partial<import('./assemble/options.js').AssembleOptions>} [options] - Overrides
 * @returns {import('./assemble/index.js').Assembled & { plan: object }}
 * @throws {DirectorError} 422 when no pick names a file of this project
 */
export function assembleFragment(plan, ctx, options = {}) {
  const kit = kitOf(ctx);
  const resolved = resolvePlan(plan, ctx.media, kit);
  if (!resolved.picks.length)
    throw new DirectorError('The plan uses no file from this project', {
      status: 422,
      detail: resolved.notes.join(' '),
    });
  const opts = assembleOptions(ctx.format, ctx.directive.params, {
    pool: brollPool(ctx.media, resolved),
    kit,
    ...options,
  });
  return { ...assemblePlan(resolved, opts), plan: describePlan(resolved) };
}

/**
 * Resolve and assemble a schema-valid plan into a DirectorResult.
 * @param {any} plan - Valid against PLAN_SCHEMA
 * @param {ActionContext} ctx
 * @param {{ notes?: string[], options?: Partial<import('./assemble/options.js').AssembleOptions> }} [pre] -
 *   Notes to put first, and overrides for the assembly options
 * @returns {import('./result.js').DirectorResult}
 */
export function assembleResult(plan, ctx, pre = {}) {
  const built = assembleFragment(plan, ctx, pre.options);
  return directorResult(
    { ...built, notes: [...(pre.notes || []), ...built.notes] },
    ctx.directive,
    ctx.edl,
    ctx.format.fps,
  );
}
