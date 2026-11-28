/**
 * The button row of the Brand dialog (`<brand-dialog>`): "Customise…" and
 * "Done" while choosing; "All kits", "Save to library as…" and "Save for
 * this project" while customising — or, once a name is being asked for,
 * the name and its two buttons.
 * @module utils/brandUi/dialogFooter
 */

import { html } from 'hybrids';
import { handleSave } from './dialogDraftEvents.js';
import * as on from './dialogEvents.js';
import * as naming from './dialogNaming.js';

/** @typedef {import('./dialogEvents.js').BrandDialogHost} BrandDialogHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** @param {BrandDialogHost} host @returns {Template} */
export function dialogFooter(host) {
  const { state, draft, naming: asking, libraryName } = host;
  const busy = Boolean(state.busy);
  const note = html`<span class="app-dialog-note" role="status">${state.busy}</span>`;
  if (state.view === 'choose') {
    return html`${note}
      <button
        type="button"
        class="btn btn-secondary"
        data-action="customise"
        disabled="${busy}"
        onclick="${on.handleCustomise}"
      >
        <app-icon name="sliders" size="sm"></app-icon> Customise…
      </button>
      <button type="button" class="btn btn-primary" data-action="done" onclick="${on.handleClose}">
        Done
      </button>`;
  }
  if (asking) {
    return html`<label class="brand-dialog-naming">
        <span>Name in the library</span>
        <input
          class="field-input brand-dialog-name"
          type="text"
          maxlength="80"
          placeholder="Acme"
          value="${libraryName}"
          oninput="${naming.handleName}"
          onkeydown="${naming.handleNameKeys}"
        />
      </label>
      <button type="button" class="btn btn-ghost" onclick="${naming.handleNamingCancel}">
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        data-action="save-library"
        disabled="${busy || !libraryName.trim()}"
        onclick="${naming.handleSaveAs}"
      >
        Save to library
      </button>`;
  }
  return html`<button
      type="button"
      class="btn btn-ghost"
      data-action="back"
      onclick="${on.handleBack}"
    >
      <app-icon name="chevron-left" size="sm"></app-icon> All kits
    </button>
    ${note}
    <button
      type="button"
      class="btn btn-secondary"
      data-action="save-as"
      disabled="${busy}"
      onclick="${naming.handleNaming}"
    >
      Save to library as…
    </button>
    <button
      type="button"
      class="btn btn-primary"
      data-action="save"
      disabled="${busy || !draft.dirty}"
      onclick="${handleSave}"
    >
      Save for this project
    </button>`;
}
