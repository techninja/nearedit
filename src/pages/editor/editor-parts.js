/**
 * Pieces of the editor page's template: the dock's tabs and panels (with
 * the web editor and music editor dialogs, which the Create tab, the
 * inspector and the timeline open), and the view shown when the adaptation
 * could not be opened.
 * @module pages/editor/editor-parts
 */

import { html } from 'hybrids';
import { failureView } from '#utils/ui/editorFailure.js';
import '#atoms/app-icon/index.js';
import '#organisms/brand-dialog/index.js';
import '#organisms/clip-inspector/index.js';
import '#organisms/create-panel/index.js';
import '#organisms/cutout-watch/index.js';
import '#organisms/director-panel/index.js';
import '#organisms/media-bin/index.js';
import '#organisms/music-editor/index.js';
import '#organisms/transcript-panel/index.js';
import '#organisms/web-editor/index.js';

/** The dock's tabs (ids as in `DOCK_TABS` of `#utils/ui/layout.js`). */
export const TABS = [
  { id: 'media', label: 'Media', icon: 'film' },
  { id: 'create', label: 'Create', icon: 'generate' },
  { id: 'inspector', label: 'Inspector', icon: 'sliders' },
  { id: 'transcript', label: 'Transcript', icon: 'captions' },
  { id: 'director', label: 'Director', icon: 'ai' },
];

const PANELS = {
  media: html`<media-bin></media-bin>`,
  create: html`<create-panel></create-panel>`,
  inspector: html`<clip-inspector></clip-inspector>`,
  transcript: html`<transcript-panel></transcript-panel>`,
  director: html`<director-panel></director-panel>`,
};

/** Panels created so far: one is made when its tab is first opened, then kept. */
const mounted = new Set();

/**
 * The dock's tab panels. Only the active one shows; the others keep their
 * state (scroll position, a running director job) while hidden.
 * @param {string} active - Id of the tab that is showing
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function dockPanels(active) {
  mounted.add(active);
  return html`
    <div class="editor-view-panels">
      ${TABS.map(({ id, label }) =>
        html`
          <div
            class="editor-view-panel"
            role="tabpanel"
            id="${`editor-dock-${id}`}"
            aria-label="${label}"
            hidden="${id !== active}"
          >
            ${mounted.has(id) ? PANELS[id] : html``}
          </div>
        `.key(id),
      )}
    </div>
    <web-editor></web-editor>
    <music-editor></music-editor>
    <brand-dialog></brand-dialog>
    <cutout-watch></cutout-watch>
  `;
}

/**
 * Shown instead of the editor when the adaptation could not be opened.
 * @param {{ missing: import('#utils/ui/editorFailure.js').MissingKind, message: string }} page
 * @param {string} projectId
 * @param {(host: any) => void} retry - Handler of the "Try again" button
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function failureTemplate(page, projectId, retry) {
  const view = failureView(page.missing, page.message, projectId);
  return html`
    <main class="app-full-state editor-view-failed" role="alert">
      <app-icon name="${view.retry ? 'alert' : 'search'}" size="lg"></app-icon>
      <h1>${view.title}</h1>
      <p>${view.text}</p>
      ${view.retry
        ? html`<button type="button" class="btn btn-primary" onclick="${retry}">Try again</button>`
        : html``}
      <a class="${view.retry ? '' : 'btn btn-primary'}" href="${view.backUrl}">${view.backLabel}</a>
    </main>
  `;
}
