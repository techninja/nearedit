/**
 * The inside of a dialog — title bar with a close button, body, footer —
 * as a template function, so the component that owns the dialog keeps its
 * own event handlers (light DOM has no slots). Wrap it in `<app-dialog>`.
 * @module utils/ui/dialogFrame
 */

import { html } from 'hybrids';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} DialogFrame
 * @property {string} title
 * @property {any} body - Template
 * @property {any} [footer] - Template for the button row; omit for none
 * @property {'small'|'normal'|'wide'|'huge'} [size]
 * @property {(host: any, event: Event) => void} onClose - Handler of the close button
 */

/**
 * @param {DialogFrame} frame
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function dialogFrame({ title, body, footer, size = 'normal', onClose }) {
  return html`
    <div class="dialog app-dialog-${size}" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="dialog-header">
        <h2 class="app-dialog-title">${title}</h2>
        <button type="button" class="icon-btn" aria-label="Close" title="Close" onclick="${onClose}">
          <app-icon name="x" size="sm"></app-icon>
        </button>
      </header>
      <div class="dialog-body">${body}</div>
      ${footer ? html`<footer class="dialog-footer">${footer}</footer>` : html``}
    </div>
  `;
}
