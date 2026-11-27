/**
 * Background jobs for analysis: one batch job over many files, or one step
 * on one file. Progress is reported across the whole batch.
 * @module api/intelligence/analyzeJob
 */

import { basename } from 'node:path';
import { runJob } from '../lib/jobRunner.js';
import { analyzeFile } from './pipeline.js';
import { getSettings } from './settings.js';
import { STEPS } from './steps/index.js';

/** @typedef {import('./steps/types.js').Step} Step */

/**
 * Wrap a job's progress callback so it only fires when the whole-number
 * percentage changes: every call is broadcast to all WebSocket clients, and
 * FFmpeg reports progress many times a second. 100 is left to job completion.
 * @param {(percent: number) => void} progress
 * @returns {(fraction: number) => void} Takes 0..1
 */
function percentReporter(progress) {
  let shown = -1;
  return (fraction) => {
    const percent = Math.min(99, Math.floor(fraction * 100));
    if (percent === shown) return;
    shown = percent;
    progress(percent);
  };
}

/**
 * @typedef {Object} BatchRequest
 * @property {string} [type] - Job type: 'analyze' or 'index'
 * @property {string} [projectId]
 * @property {string[]} files - Absolute, validated paths
 * @property {Step[]|null} [steps] - null = every step that suits each file
 * @property {boolean} [force]
 * @property {import('./steps/types.js').Deps} [deps]
 */

/**
 * Start one job that runs steps over many files.
 * Result: `{ files: [{ path, steps: { probe: "ok", … } }], total, failed }`.
 * @param {BatchRequest} request
 * @returns {import('../lib/jobs.js').Job}
 */
export function startBatchJob(request) {
  const { type = 'analyze', projectId = '', files, steps = null, force = false, deps } = request;
  const plan = steps || STEPS;
  const count = `${files.length} file${files.length === 1 ? '' : 's'}`;
  const label = type === 'index' ? `Index: ${count}` : `Analyze: ${count}`;
  const params = { files, steps: plan.map((s) => s.name), force };
  // Probe-only indexing is quick and the media bin waits on it, so it does
  // not queue behind long transcriptions in the analysis lane.
  /** @type {'default'|'analysis'} */
  const lane = type === 'index' ? 'default' : 'analysis';

  return runJob(type, params, { projectId, label, lane }, async (ctx) => {
    const settings = getSettings();
    const cache = new Map();
    // Progress unit: one step of one file. `finished` counts completed units.
    const units = Math.max(1, files.length * plan.length);
    const report = percentReporter(ctx.progress);
    let finished = 0;

    const results = [];
    let failed = 0;
    for (const path of files) {
      if (ctx.signal.aborted) throw new Error('Analysis cancelled');
      const name = basename(path);
      const { outcomes } = await analyzeFile(path, plan, {
        force,
        explicit: !!steps,
        signal: ctx.signal,
        settings,
        deps,
        cache,
        log: (message) => ctx.log(`${name}: ${message}`),
        onProgress: (stepIndex, fraction) => report((finished + stepIndex + fraction) / units),
      });
      const ran = Object.entries(outcomes).filter(([, outcome]) => outcome !== 'skipped');
      if (ran.length) ctx.log(`${name}: ${ran.map(([step, o]) => `${step} ${o}`).join(', ')}`);
      if (Object.values(outcomes).some((o) => o.startsWith('error'))) failed++;
      results.push({ path, steps: outcomes });
      finished += plan.length;
      report(finished / units);
    }
    return { files: results, total: files.length, failed };
  });
}

/**
 * Start a job that runs one step on one file. The job fails when the step
 * fails. Result: `{ path, step, outcome, …summary }`.
 * @param {Step} step
 * @param {{ filePath: string, options?: Record<string, any>, force?: boolean, projectId?: string,
 *   deps?: import('./steps/types.js').Deps }} request
 * @returns {import('../lib/jobs.js').Job}
 */
export function startStepJob(step, request) {
  const { filePath, options = {}, force = false, projectId = '', deps } = request;
  const title = step.name[0].toUpperCase() + step.name.slice(1);
  const label = `${title}: ${basename(filePath)}`;
  const meta = { projectId, label, lane: /** @type {const} */ ('analysis') };

  return runJob(step.jobType, { filePath, ...options, force }, meta, async (ctx) => {
    const report = percentReporter(ctx.progress);
    const { outcomes, summaries } = await analyzeFile(filePath, [step], {
      force,
      explicit: true,
      options: { [step.name]: options },
      signal: ctx.signal,
      deps,
      log: ctx.log,
      onProgress: (_index, fraction) => report(fraction),
    });
    const outcome = outcomes[step.name] || 'skipped';
    if (outcome.startsWith('error: ')) throw new Error(outcome.slice('error: '.length));
    return { path: filePath, step: step.name, outcome, ...summaries[step.name] };
  });
}
