/**
 * The token editor's template for a logo token: the picture that is
 * chosen, with a button to choose one and one to do without.
 * @module utils/brandUi/tokenEditorLogo
 */

import { html } from 'hybrids';
import { fileUrl } from '#utils/create/thumbEnv.js';
import { tokenAt } from './draft.js';
import { LOGO_ACCEPT } from './fontFiles.js';
import * as on from './tokenEditorEvents.js';
import { picker, resetButton } from './tokenEditorParts.js';

/** @typedef {import('./tokenEditorEvents.js').TokenEditorHost} TokenEditorHost */
/** @typedef {import('./tokenFields.js').TokenField} TokenField */

/**
 * A logo token: the picture that is chosen, and buttons to choose or drop one.
 * @param {TokenEditorHost} host
 * @param {TokenField} field
 */
export function logoRow(host, { path, spec }) {
  const file = tokenAt(host.tokens, path) || '';
  const name = decodeURIComponent(file.split(/[\\/#]/).pop() || '');
  return html`<div class="brand-token-row brand-token-logo" data-path="${path}">
    <div class="field-row">
      <span class="field-label" title="${spec.description || ''}">${spec.label}</span>
      <span class="brand-token-pair">
        ${file
          ? html`<img src="${fileUrl(file)}" alt="" /><span class="brand-token-file" title="${name}"
                >${name}</span
              >`
          : html`<span class="brand-token-file brand-token-nofile">None — a mark is drawn</span>`}
        <button
          type="button"
          class="btn btn-secondary"
          data-path="${path}"
          onclick="${on.handlePick}"
        >
          ${file ? 'Replace…' : 'Upload…'}
        </button>
        ${file
          ? html`<button
              type="button"
              class="icon-btn"
              data-path="${path}"
              title="Do without this picture"
              aria-label="${`Remove the ${spec.label.toLowerCase()}`}"
              onclick="${on.handleClear}"
            >
              <app-icon name="x" size="sm"></app-icon>
            </button>`
          : html``}
        ${picker(path, LOGO_ACCEPT)}
      </span>
    </div>
    ${resetButton(host, path, spec.label)}
  </div>`.key(path);
}
