/**
 * One analysis run as the media bin sees it: check which providers are
 * usable, start the job, report live progress, and end with a summary a
 * person can read — including every step that was skipped and why.
 * @module utils/media/analysisRun
 */

import { providerProblems, summarizeAnalysis } from '#utils/media/analysis.js';
import { analyzeMedia, intelligenceStatus } from '#utils/media/analyze.js';
import { loadLibrary } from '#utils/media/library.js';

/**
 * @typedef {Object} RunReport
 * @property {{ active?: boolean, label?: string, progress?: number, detail?: string }} [job]
 * @property {{ kind?: string, headline?: string, problems?: string[] }} [notice]
 * @property {Record<string, any>} [status] - Fresh provider status
 */

const REFRESH_EVERY_MS = 3000;

/** @type {AbortController|null} */
let controller = null;

/** @returns {boolean} true while a run started here is in progress */
export const analysisRunning = () => controller !== null;

/** Cancel the run in progress, if any. */
export function cancelAnalysis() {
  controller?.abort();
}

/**
 * The warning shown when providers are missing.
 * @param {Record<string, any>|null} status
 * @returns {RunReport['notice']} {} when everything is available
 */
export function providerNotice(status) {
  const missing = providerProblems(status);
  if (!missing.length) return {};
  const names = missing.map((problem) => problem.capability.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return {
    kind: 'warning',
    headline: `Not available: ${list}`,
    problems: missing.map((problem) => problem.message),
  };
}

/**
 * Analyse files and keep the caller informed.
 * @param {{ paths?: string[], steps?: string[], force?: boolean }} what - No
 *   `paths`: every file of the project
 * @param {(report: RunReport) => void} report - Called with partial updates
 * @returns {Promise<void>} Resolves when the run is over, however it ended
 */
export async function runAnalysis(what, report) {
  if (controller) return;
  controller = new AbortController();
  report({ job: { active: true, label: 'Starting analysis…', progress: 0 }, notice: {} });
  try {
    const status = await intelligenceStatus({ refresh: true }).catch((err) => {
      console.warn('[media] provider status is unknown:', err.message);
      return null;
    });
    if (status) report({ status, notice: providerNotice(status) });
    let refreshed = Date.now();
    const result = await analyzeMedia(what, {
      signal: controller.signal,
      onUpdate: ({ label, progress, log }) => {
        report({ job: { active: true, label, progress, detail: log?.[log.length - 1] || '' } });
        // A long batch finishes file by file: let the badges catch up as it goes.
        if (Date.now() - refreshed < REFRESH_EVERY_MS) return;
        refreshed = Date.now();
        loadLibrary();
      },
    });
    const { headline, problems, failed } = summarizeAnalysis(result);
    const kind = failed ? 'error' : problems.length ? 'warning' : 'success';
    report({ job: {}, notice: { kind, headline, problems } });
  } catch (err) {
    const cancelled = err.message === 'Cancelled';
    const problems = cancelled ? [] : [err.message, err.body?.detail].filter(Boolean);
    const headline = cancelled ? 'Analysis cancelled' : 'The analysis could not run';
    report({ job: {}, notice: { kind: cancelled ? 'info' : 'error', headline, problems } });
  } finally {
    controller = null;
  }
}
