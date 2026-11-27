/**
 * Adaptation dialog organism — the form for a new adaptation (name, shape
 * preset, size, frame rate, and for a variant: its parent and whether to
 * start from a copy of the parent's timeline) and for editing one.
 * State: the `dialog` of `#utils/projects/projectPage.js`.
 * @module components/organisms/adaptation-dialog
 */

import { html, define } from 'hybrids';
import { closeAdaptationDialog, setAdaptationField } from '#utils/projects/adaptationActions.js';
import { submitAdaptation } from '#utils/projects/adaptationActions.js';
import { projectPageState } from '#utils/projects/projectPage.js';
import { adaptationRows } from '#utils/projects/tree.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';
import '#molecules/adaptation-options/index.js';
import '#molecules/adaptation-shapes/index.js';

/**
 * @typedef {Object} AdaptationDialogHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 */

/** @param {AdaptationDialogHost} _host @param {InputEvent} event */
function handleName(_host, event) {
  setAdaptationField('name', /** @type {HTMLInputElement} */ (event.target).value);
}

/** @param {AdaptationDialogHost} _host @param {CustomEvent} event */
function handleField(_host, event) {
  setAdaptationField(event.detail.key, event.detail.value);
}

/** @param {AdaptationDialogHost} _host @param {Event} event */
function handleSubmit(_host, event) {
  event.preventDefault();
  submitAdaptation();
}

/**
 * @param {import('#utils/projects/projectPage.js').ProjectPageState} state
 * @returns {import('hybrids').UpdateFunctionWithMethods<AdaptationDialogHost>}
 */
function body({ dialog, project }) {
  const { values, errors, editingId } = dialog;
  return html`
    <form
      id="adaptation-dialog-form"
      class="adaptation-dialog-form"
      onsubmit="${handleSubmit}"
      onfieldchange="${handleField}"
    >
      <label class="adaptation-dialog-name">
        <span>Name</span>
        <input
          class="field-input"
          name="name"
          maxlength="200"
          autocomplete="off"
          data-autofocus
          placeholder="e.g. YouTube long form"
          value="${values.name}"
          oninput="${handleName}"
        />
        ${errors.name
          ? html`<span class="error-message" role="alert">${errors.name}</span>`
          : html``}
      </label>
      <adaptation-shapes value="${values.aspectRatio}"></adaptation-shapes>
      <adaptation-options
        values="${values}"
        parents="${adaptationRows(project?.adaptations || [])}"
        editing="${Boolean(editingId)}"
      ></adaptation-options>
      ${dialog.error ? html`<p class="error-message" role="alert">${dialog.error}</p>` : html``}
    </form>
  `;
}

/**
 * @param {import('#utils/projects/adaptationActions.js').AdaptationDialog} dialog
 * @returns {import('hybrids').UpdateFunctionWithMethods<AdaptationDialogHost>}
 */
function footer(dialog) {
  const label = dialog.editingId ? 'Save' : 'Create adaptation';
  return html`
    <button type="button" class="btn btn-secondary" onclick="${closeAdaptationDialog}">
      Cancel
    </button>
    <button
      type="submit"
      form="adaptation-dialog-form"
      class="btn btn-primary adaptation-dialog-submit"
      disabled="${dialog.busy}"
    >
      ${dialog.busy ? 'Working…' : label}
    </button>
  `;
}

/** @type {import('hybrids').Component<AdaptationDialogHost>} */
export default define({
  tag: 'adaptation-dialog',
  state: watch(projectPageState),
  render: {
    value: ({ state }) =>
      state.dialog
        ? html`<app-dialog open onclose="${closeAdaptationDialog}">
            ${dialogFrame({
              title: state.dialog.editingId ? 'Edit adaptation' : 'New adaptation',
              body: body(state),
              footer: footer(state.dialog),
              onClose: closeAdaptationDialog,
            })}
          </app-dialog>`
        : html``,
    shadow: false,
  },
});
