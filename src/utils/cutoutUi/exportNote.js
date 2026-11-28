/**
 * The export dialog's note about cutouts: a render draws a clip through
 * its matte only once the cutout is made — so while some are being made,
 * or could not be, the dialog says which clips would render with their
 * background and offers to make them first. Beside the note about web
 * clips, and built the same way.
 * @module utils/cutoutUi/exportNote
 */

import { html } from 'hybrids';
import { clipsWaiting } from './clipStatus.js';
import { makeWaiting } from './runtime.js';
import { isMaking } from './state.js';

/** @typedef {import('./state.js').CutoutJobs} CutoutJobs */

// What the dialog watches to keep the note current.
export { cutoutJobs } from './state.js';

/** Names listed before the rest become "and n more". */
const MAX_NAMES = 3;

/** Make every cutout that is held up; the note follows the progress. */
const handleMake = () => void makeWaiting();

/**
 * What the note says, as data.
 * @param {any} doc - The open document
 * @param {CutoutJobs} jobs
 * @returns {{ total: number, title: string, making: string, problem: string,
 *   canMake: boolean, action: string }} `total` 0: every cutout is made (or
 *   there is none); `action`: what the button that tries again says
 */
export function exportNoteModel(doc, jobs) {
  const waiting = clipsWaiting(doc);
  const total = waiting.length;
  const names = [...new Set(waiting.map((clip) => clip.name))];
  const more = names.length > MAX_NAMES ? ` and ${names.length - MAX_NAMES} more` : '';
  const listed = `${names.slice(0, MAX_NAMES).join(', ')}${more}`;
  const noun =
    total === 1 ? 'clip is waiting for its cutout' : 'clips are waiting for their cutout';
  const files = [...new Set(waiting.map((clip) => clip.path))].map((path) => jobs.byPath[path]);
  const active = files.filter((job) => !job || isMaking(job));
  const [running] = active.filter((job) => job?.status === 'running' && job.frames > 0);
  const frames = running ? ` — frame ${running.frame} of ${running.frames}` : '';
  const stuck = files.find((job) => job && !isMaking(job));
  const missing = stuck?.status === 'unavailable';
  return {
    total,
    title: `${total} ${noun}: ${listed}.`,
    making: active.length ? `Making ${active.length === 1 ? 'it' : 'them'} now${frames}…` : '',
    problem: stuck
      ? missing
        ? `This server cannot make cutouts: ${stuck.message}`
        : stuck.message || 'Making a cutout was cancelled'
      : '',
    canMake: Boolean(stuck) && !active.length,
    action: missing ? 'Check again' : total === 1 ? 'Make it first' : 'Make them first',
  };
}

/**
 * @param {any} doc - The open document
 * @param {CutoutJobs} jobs
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>} Nothing when
 *   every clip with cutout on has its cutout
 */
export function cutoutExportNote(doc, jobs) {
  const note = exportNoteModel(doc, jobs);
  if (!note.total) return html``;
  return html`<div class="app-callout export-dialog-cutout" role="status">
    <app-icon name="alert" size="sm"></app-icon>
    <div class="app-callout-body">
      <strong>${note.title}</strong>
      <span
        >A render cuts a person out only where the cutout is made: these clips would render with
        their background.</span
      >
      ${note.problem ? html`<span class="error-message">${note.problem}</span>` : html``}
      ${note.making
        ? html`<span><span class="spinner"></span> ${note.making}</span>`
        : html`<span>
            <button
              type="button"
              class="btn btn-secondary export-dialog-make"
              disabled="${!note.canMake}"
              onclick="${handleMake}"
            >
              <app-icon name="person" size="sm"></app-icon> ${note.action}
            </button>
          </span>`}
    </div>
  </div>`;
}
