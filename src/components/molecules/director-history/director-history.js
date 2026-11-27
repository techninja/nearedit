/**
 * Director history molecule — what the director did in this session, with
 * a way to take each run back. Announces `runundo` (`detail.id`).
 * @module components/molecules/director-history
 */

import { html, define, dispatch } from 'hybrids';
import { timeAgo } from '#utils/ui/format.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {import('#utils/directorUi/history.js').RunRecord & { kind: 'undo'|'revert'|'none' }} RunItem
 * @typedef {Object} DirectorHistoryHost
 * @property {RunItem[]} runs - Newest first, each with how it can be taken back
 */

const UNDO_TEXT = {
  undo: ['Undo this', 'Undo this run'],
  revert: ['Restore before', 'Put the timeline back as it was before this run'],
};

/** @param {DirectorHistoryHost & HTMLElement} host @param {MouseEvent} event */
function handleUndo(host, event) {
  const id = Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.id);
  dispatch(host, 'runundo', { detail: { id }, bubbles: true });
}

/**
 * @param {RunItem} run
 * @param {number} index
 * @returns {import('hybrids').UpdateFunctionWithMethods<DirectorHistoryHost>}
 */
function runTemplate(run, index) {
  return html`
    <li class="director-history-run ${run.undone ? 'director-history-undone' : ''}">
      <div class="director-history-head">
        <strong>${run.title}</strong>
        <span class="director-history-when">
          ${run.where ? `${run.where} · ` : ''}${run.undone ? 'undone' : timeAgo(run.time)}
        </span>
      </div>
      <p class="director-history-summary">${run.summary}</p>
      ${run.notes.length
        ? html`<details open="${index === 0 && !run.undone}">
            <summary>${run.notes.length === 1 ? '1 note' : `${run.notes.length} notes`}</summary>
            <ul class="director-history-notes">
              ${run.notes.map((note) => html`<li>${note}</li>`)}
            </ul>
          </details>`
        : html``}
      ${UNDO_TEXT[run.kind]
        ? html`<button
            type="button"
            class="btn btn-secondary director-history-undo"
            data-id="${run.id}"
            title="${UNDO_TEXT[run.kind][1]}"
            onclick="${handleUndo}"
          >
            <app-icon name="undo" size="sm"></app-icon> ${UNDO_TEXT[run.kind][0]}
          </button>`
        : html``}
    </li>
  `.key(run.id);
}

/** @type {import('hybrids').Component<DirectorHistoryHost>} */
export default define({
  tag: 'director-history',
  runs: { value: [] },
  render: {
    value: ({ runs }) =>
      runs.length
        ? html`
            <section class="director-history" aria-label="What the director did">
              <h3>This session</h3>
              <ol>
                ${runs.map(runTemplate)}
              </ol>
            </section>
          `
        : html``,
    shadow: false,
  },
});
