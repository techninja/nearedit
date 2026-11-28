/**
 * Running a prepared directive inside a job: gather the project's media,
 * dispatch to the action, report progress.
 * @module api/director/run
 */

import { baseEdit } from './actions/baseEdit.js';
import { generateEdit } from './actions/generateEdit.js';
import { insertBroll } from './actions/insertBroll.js';
import { motionPiece } from './actions/motion.js';
import { executeScript, generateScripts } from './actions/scripts.js';
import { siteDemo } from './actions/siteDemo.js';
import { gatherMedia } from './context/gather.js';
import { addCaptions } from './inplace/addCaptions.js';
import { beatSync } from './inplace/beatSync.js';
import { removeSilence } from './inplace/removeSilence.js';

/** @type {Record<string, (ctx: import('./pipeline.js').ActionContext) => any>} */
export const HANDLERS = {
  base_edit: baseEdit,
  generate_edit: generateEdit,
  generate_script: generateScripts,
  execute_script: executeScript,
  insert_broll: insertBroll,
  motion_piece: motionPiece,
  site_demo: (ctx) => siteDemo(ctx),
  remove_silence: removeSilence,
  beat_sync: beatSync,
  add_captions: addCaptions,
};

/**
 * Whether this run will talk to the LLM (decides the job lane).
 * @param {import('./request.js').Prepared} prepared
 * @returns {boolean}
 */
export function usesLlm(prepared) {
  const { action, directive } = prepared;
  return action.llm === 'yes' || (action.llm === 'optional' && directive.params.useLlm === true);
}

/**
 * Job label shown in the jobs list.
 * @param {import('./request.js').Prepared} prepared
 * @returns {string}
 */
export function jobLabel(prepared) {
  const { action, directive } = prepared;
  const hint = directive.prompt.replace(/\s+/g, ' ').slice(0, 60);
  return hint && action.id !== 'execute_script' ? `${action.title}: ${hint}` : action.title;
}

/**
 * The project's media with their sidecars — or nothing, for an action that
 * never looks at media (`media: false` in its schema).
 * @param {import('./request.js').Prepared} prepared
 * @param {import('../lib/jobs.js').JobContext} job
 * @returns {Promise<any[]>}
 */
async function readMedia(prepared, job) {
  if (prepared.action.media === false) {
    job.progress(10, prepared.action.title);
    return [];
  }
  job.progress(2, 'Reading the project’s media…');
  const media = await gatherMedia(prepared.projectId, {
    signal: job.signal,
    onProgress: (done, total) => {
      if (done % 25 === 0) job.progress(2 + (8 * done) / total, `Read ${done} of ${total} files`);
    },
  });
  const analysed = media.filter((m) => m.analysed).length;
  job.progress(10, `${media.length} media files (${analysed} analysed) — ${prepared.action.title}`);
  return media;
}

/**
 * Job worker: run one directive to its result.
 * @param {import('./request.js').Prepared} prepared
 * @param {import('./llm/client.js').LlmClient} llm
 * @param {import('../lib/jobs.js').JobContext} job
 * @returns {Promise<any>} A DirectorResult, or the script result of `generate_script`
 */
export async function runDirective(prepared, llm, job) {
  const media = await readMedia(prepared, job);
  const result = await HANDLERS[prepared.action.id]({
    projectId: prepared.projectId,
    projectDir: prepared.projectDir,
    directive: prepared.directive,
    edl: prepared.edl,
    format: prepared.format,
    media,
    llm,
    signal: job.signal,
    progress: job.progress,
    log: job.log,
  });
  job.signal.throwIfAborted();
  job.progress(99, result.summary);
  return result;
}
