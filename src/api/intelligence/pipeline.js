/**
 * Runs analysis steps over one file. Each step is asked the same questions
 * (suitable? already done? provider usable?), then run, and its patch merged
 * into the sidecar. A step never takes the others down with it: failures and
 * skips are recorded per step.
 * @module api/intelligence/pipeline
 */

import { readSidecar, updateSidecar } from '../lib/sidecar.js';
import { mediaType } from '../lib/mediaScan.js';
import { getSettings } from './settings.js';
import { probeStep, isProbed } from './steps/probe.js';
import { defaultDeps } from './steps/types.js';

/**
 * @typedef {Object} AnalyzeOptions
 * @property {boolean} [force] - Re-run steps whose result is already in the sidecar
 * @property {boolean} [explicit] - The caller named the steps: report unsuitable ones as
 *   skipped instead of leaving them out
 * @property {Record<string, Record<string, any>>} [options] - Per-step options, keyed by step name
 * @property {AbortSignal} [signal]
 * @property {(stepIndex: number, fraction: number) => void} [onProgress]
 * @property {(message: string) => void} [log]
 * @property {import('./settings.js').Settings} [settings]
 * @property {import('./steps/types.js').Deps} [deps]
 * @property {Map<string, any>} [cache] - Shared across the files of one job
 */

/**
 * @typedef {Object} FileOutcome
 * @property {Record<string, string>} outcomes - step → "ok" | "skipped" | "skipped: why" | "error: why"
 * @property {Record<string, Record<string, any>>} summaries - step → small facts about a fresh result
 */

/**
 * @param {AbortSignal} [signal]
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error('Analysis cancelled');
}

/**
 * Run one step against one file.
 * @param {import('./steps/types.js').Step} step
 * @param {string} filePath
 * @param {Omit<import('./steps/types.js').StepContext, 'sidecar'>} ctx
 * @param {{ force?: boolean, explicit?: boolean }} mode
 * @returns {Promise<{ outcome: string, summary?: Record<string, any> }|null>} null = left out
 */
async function runStep(step, filePath, ctx, mode) {
  const sidecar = readSidecar(filePath);
  const reason = step.unsuitable(ctx.type, sidecar);
  if (reason) return mode.explicit ? { outcome: `skipped: ${reason}` } : null;
  if (!mode.force && step.done(sidecar, ctx.options)) return { outcome: 'skipped' };
  if (step.available) {
    const state = await step.available(ctx);
    if (!state.available) {
      // Explain in full once per job; each file then carries the short form.
      if (state.reason && !ctx.cache.has(`explained:${step.name}`)) {
        ctx.cache.set(`explained:${step.name}`, true);
        ctx.log(`${step.name} unavailable — ${state.reason}`);
      }
      return { outcome: `skipped: ${state.detail}` };
    }
  }
  try {
    const patch = await step.run(filePath, { ...ctx, sidecar });
    updateSidecar(filePath, patch);
    return { outcome: 'ok', summary: step.summary(patch) };
  } catch (err) {
    if (ctx.signal?.aborted) throw err;
    return { outcome: `error: ${err.message}` };
  }
}

/**
 * Analyse one media file.
 * @param {string} filePath - Absolute, already validated path
 * @param {import('./steps/types.js').Step[]} steps - In execution order
 * @param {AnalyzeOptions} [opts]
 * @returns {Promise<FileOutcome>}
 */
export async function analyzeFile(filePath, steps, opts = {}) {
  const { signal, onProgress = () => {}, log = () => {} } = opts;
  const type = mediaType(filePath);
  /** @type {FileOutcome} */
  const result = { outcomes: {}, summaries: {} };
  if (!type) return result;
  const shared = {
    type,
    signal,
    log,
    settings: opts.settings || getSettings(),
    deps: opts.deps || defaultDeps,
    cache: opts.cache || new Map(),
  };
  const mode = { force: opts.force, explicit: opts.explicit };

  // Every other step leans on probe data (duration, hasAudio…): make sure it
  // exists even when the caller asked for a single step.
  if (!steps.includes(probeStep) && !isProbed(readSidecar(filePath))) {
    throwIfAborted(signal);
    const implicit = await runStep(
      probeStep,
      filePath,
      { ...shared, options: {}, progress: () => {} },
      {},
    );
    if (implicit?.outcome.startsWith('error')) log(`probe ${implicit.outcome}`);
  }

  for (const [index, step] of steps.entries()) {
    throwIfAborted(signal);
    const ctx = {
      ...shared,
      options: opts.options?.[step.name] || {},
      progress: (fraction) => onProgress(index, Math.max(0, Math.min(1, fraction || 0))),
    };
    const done = await runStep(step, filePath, ctx, mode);
    if (!done) continue;
    result.outcomes[step.name] = done.outcome;
    if (done.summary) result.summaries[step.name] = done.summary;
  }
  return result;
}
