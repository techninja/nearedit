/**
 * Director progress molecule — the running job: how far it is, what it
 * last said, and a way to cancel it. Announces `runcancel`.
 * @module components/molecules/director-progress
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {Object} DirectorProgressHost
 * @property {import('#utils/directorUi/state.js').RunProgress} run
 */

/** @param {DirectorProgressHost & HTMLElement} host */
function handleCancel(host) {
  dispatch(host, 'runcancel', { bubbles: true });
}

/** @type {import('hybrids').Component<DirectorProgressHost>} */
export default define({
  tag: 'director-progress',
  run: { value: { title: '', progress: 0, log: [], cancelling: false } },
  render: {
    value: ({ run }) => {
      const percent = Math.round(run.progress || 0);
      return html`
        <div class="director-progress" role="status">
          <div class="director-progress-head">
            <span class="spinner"></span>
            <strong
              >${run.cancelling ? 'Cancelling…' : `${run.title} — working… ${percent}%`}</strong
            >
          </div>
          <div
            class="progress"
            role="progressbar"
            aria-label="${run.title}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${percent}"
          >
            <div class="progress-bar" style="${{ width: `${percent}%` }}"></div>
          </div>
          <ol class="director-progress-log" aria-label="What the director is doing">
            ${(run.log || []).map((line) => html`<li>${line}</li>`)}
          </ol>
          <button
            type="button"
            class="btn btn-secondary"
            disabled="${run.cancelling}"
            onclick="${handleCancel}"
          >
            Cancel
          </button>
          <p class="director-progress-note">
            Nothing changes on the timeline until the director is done; the result arrives as one
            step you can undo.
          </p>
        </div>
      `;
    },
    shadow: false,
  },
});
