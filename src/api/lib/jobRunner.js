/**
 * Job runner — executes job workers in concurrency lanes.
 * @module api/lib/jobRunner
 */

import { getConfig } from './config.js';
import { createJob, updateJob, setController } from './jobs.js';

/** @typedef {import('./jobs.js').Job} Job */
/** @typedef {import('./jobs.js').JobContext} JobContext */

/** @type {Map<string, { active: number, waiting: (() => void)[] }>} */
const lanes = new Map();

/**
 * Create a job and run `worker` in a concurrency lane. Never throws: a
 * failing worker marks the job 'error'. The worker's return value becomes
 * job.result.
 * @param {string} type
 * @param {object} params
 * @param {{ projectId?: string, label?: string,
 *   lane?: 'render'|'analysis'|'web'|'cutout'|'llm'|'default' }} meta
 * @param {(ctx: JobContext) => Promise<any>} worker
 * @returns {Job}
 */
export function runJob(type, params, meta, worker) {
  const job = createJob(type, params, meta);
  const controller = new AbortController();
  setController(job.id, controller);
  const laneName = meta.lane || 'default';
  const cfg = getConfig().jobs;
  const limits = {
    ...{ render: cfg.renderConcurrency, analysis: cfg.analysisConcurrency },
    ...{ web: cfg.webConcurrency, cutout: cfg.cutoutConcurrency },
  };
  const limit = limits[laneName] || 2;
  const lane = lanes.get(laneName) || { active: 0, waiting: [] };
  lanes.set(laneName, lane);

  // Read through a function: status changes behind TypeScript's narrowing.
  const cancelled = () => /** @type {string} */ (job.status) === 'cancelled';

  const start = async () => {
    lane.active++;
    try {
      if (cancelled()) return;
      updateJob(job.id, { status: 'running' });
      const result = await worker({
        job,
        signal: controller.signal,
        progress: (percent, message) =>
          updateJob(job.id, { progress: Math.round(percent), ...(message && { log: [message] }) }),
        log: (message) => updateJob(job.id, { log: [message] }),
      });
      if (cancelled()) return;
      updateJob(job.id, { status: 'complete', progress: 100, result: result ?? {} });
    } catch (err) {
      if (cancelled()) return;
      console.error(`[jobs] ${type} ${job.id} failed:`, err.message);
      updateJob(job.id, { status: 'error', error: err.message, log: [`Error: ${err.message}`] });
    } finally {
      setController(job.id, null);
      lane.active--;
      lane.waiting.shift()?.();
    }
  };
  if (lane.active < limit) start();
  else lane.waiting.push(start);
  return job;
}
