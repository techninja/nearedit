/**
 * Director scripts molecule — the review of generated edit scripts: the
 * options side by side to read and compare, then the chosen one in an
 * editor with the choice of where the built timeline goes.
 * Announces `scriptpick` (`detail.index`, -1 = back to comparing),
 * `scriptedit` (`detail.text`), `scriptmode` (`detail.mode`), `scriptbuild`, `scriptclose`.
 * @module components/molecules/director-scripts
 */

import { html, define, dispatch } from 'hybrids';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} DirectorScriptsHost
 * @property {import('#utils/directorUi/state.js').ScriptReview} review
 * @property {import('#utils/directorUi/modes.js').ModeChoice[]} modes
 */

/** @param {string} type @param {object} [detail] @returns {(host: HTMLElement) => void} */
const emit = (type, detail) => (host) => dispatch(host, type, { detail, bubbles: true });

/** @param {DirectorScriptsHost & HTMLElement} host @param {InputEvent} event */
function handleEdit(host, event) {
  const text = /** @type {HTMLTextAreaElement} */ (event.target).value;
  dispatch(host, 'scriptedit', { detail: { text }, bubbles: true });
}

/** @param {DirectorScriptsHost & HTMLElement} host @param {Event} event */
function handleMode(host, event) {
  const mode = /** @type {HTMLSelectElement} */ (event.target).value;
  dispatch(host, 'scriptmode', { detail: { mode }, bubbles: true });
}

/** @param {DirectorScriptsHost} host @returns {any} */
function compare({ review }) {
  return html`
    <p class="director-scripts-intro">
      Read the options and pick the one closest to what you want — you can edit it before anything
      touches the timeline. They are saved in <code>${review.folder}</code>.
    </p>
    <div class="director-scripts-options">
      ${review.options.map(
        (option, index) => html`
          <article class="director-scripts-option" aria-label="${`Option ${option.variant}`}">
            <header>
              <strong>Option ${option.variant}</strong>
              <span>${option.filename}</span>
            </header>
            <pre tabindex="0">${option.script}</pre>
            <button
              type="button"
              class="btn btn-primary"
              onclick="${emit('scriptpick', { index })}"
            >
              Use this one
            </button>
          </article>
        `,
      )}
    </div>
  `;
}

/** @param {DirectorScriptsHost} host @returns {any} */
function edit({ review }) {
  const option = review.options[review.picked];
  return html`
    <div class="director-scripts-edit">
      <button type="button" class="btn btn-ghost" onclick="${emit('scriptpick', { index: -1 })}">
        <app-icon name="chevron-left" size="sm"></app-icon> All options
      </button>
      <label class="director-scripts-editor">
        <span>Option ${option?.variant} — edit it until it says what the video should be</span>
        <textarea
          class="field-input"
          data-autofocus
          spellcheck="true"
          value="${review.text}"
          oninput="${handleEdit}"
        ></textarea>
      </label>
    </div>
  `;
}

/** @type {import('hybrids').Component<DirectorScriptsHost>} */
export default define({
  tag: 'director-scripts',
  review: { value: { options: [], folder: '', picked: -1, text: '', mode: '', open: false } },
  modes: { value: [] },
  render: {
    value: (host) => {
      const { review } = host;
      if (!review.open) return html``;
      const editing = review.picked >= 0;
      const footer = editing
        ? html`
            <label class="director-scripts-where">
              <span>Put the result</span>
              <select class="field-input" onchange="${handleMode}">
                ${host.modes.map(
                  (choice) =>
                    html`<option
                      value="${choice.id}"
                      selected="${choice.id === review.mode}"
                      disabled="${!choice.available}"
                    >
                      ${choice.label}
                    </option>`,
                )}
              </select>
            </label>
            <button type="button" class="btn btn-secondary" onclick="${emit('scriptclose')}">
              Not now
            </button>
            <button
              type="button"
              class="btn btn-primary director-scripts-build"
              disabled="${!review.text.trim()}"
              onclick="${emit('scriptbuild')}"
            >
              <app-icon name="ai" size="sm"></app-icon> Build the timeline
            </button>
          `
        : null;
      return html`
        <app-dialog open onclose="${emit('scriptclose')}">
          ${dialogFrame({
            title: editing ? 'Edit the script' : 'Script options',
            body: editing ? edit(host) : compare(host),
            footer,
            size: 'huge',
            onClose: emit('scriptclose'),
          })}
        </app-dialog>
      `;
    },
    shadow: false,
  },
});
