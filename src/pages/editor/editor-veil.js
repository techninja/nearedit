/**
 * The editor's loading veil — laid over the editor while an adaptation
 * opens: the logo, building itself once, and under it what is happening.
 * @module pages/editor/editor-veil
 */

import { html } from 'hybrids';
import '#atoms/app-logo/index.js';

/**
 * The veil.
 * @returns {any}
 */
export function veilTemplate() {
  return html`
    <div class="editor-view-veil" role="status">
      <app-logo variant="wordmark" size="lg" animated></app-logo>
      <span class="editor-view-veil-note"><span class="spinner"></span> Opening…</span>
    </div>
  `;
}
