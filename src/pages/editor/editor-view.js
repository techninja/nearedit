/**
 * Editor page — lays the editor out: a slim header, a tabbed dock (media,
 * inspector, transcript, director) beside the preview with the transport
 * under it, and the timeline along the bottom, with draggable splitters.
 * On a narrow screen the same parts stack: preview, timeline, and the dock
 * as a bottom sheet behind a tab bar. Opens the adaptation named in the
 * URL and closes it on leave (`#utils/ui/editorPage.js`).
 * @module pages/editor
 */

import { html, define, router, store } from 'hybrids';
import AppState, { setAppState } from '#store/AppState.js';
import { TABS, dockPanels, failureTemplate } from '#pages/editor/editor-parts.js';
import { veilTemplate } from '#pages/editor/editor-veil.js';
import { handleSplitEvent } from '#utils/ui/editorLayout.js';
import { editorPageState, enterEditor, leaveEditor, setExportOpen } from '#utils/ui/editorPage.js';
import { dockTabOf, layoutVars, sheetAfterTap } from '#utils/ui/layout.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-splitter/index.js';
import '#atoms/transport-controls/index.js';
import '#molecules/app-tabs/index.js';
import '#organisms/app-editor-bar/index.js';
import '#organisms/export-dialog/index.js';
import '#organisms/timeline-panel/index.js';
import '#organisms/video-preview/index.js';

/**
 * @typedef {Object} EditorViewHost
 * @property {string} projectId - From the URL
 * @property {string} adaptationId - From the URL
 * @property {import('#store/AppState.js').AppStateShape} layout
 * @property {import('#utils/ui/editorPage.js').EditorPageState} page
 */

/** @param {EditorViewHost & HTMLElement} host @param {CustomEvent} event */
function handleSplit(host, event) {
  handleSplitEvent(host.querySelector('.editor-view'), event);
}

/** Wide layout: a tab of the dock was chosen. @param {EditorViewHost} _host @param {CustomEvent} event */
function handleTab(_host, event) {
  setAppState({ dockTab: event.detail.id });
}

/** "Open transcript" in the media bin: bring the transcript tab forward. */
const handleTranscript = () => setAppState({ dockTab: 'transcript', sheetOpen: true });

/** Narrow layout: the bottom bar opens and closes the sheet. @param {EditorViewHost} host @param {CustomEvent} event */
function handleBarTab(host, event) {
  setAppState(sheetAfterTap(host.layout, event.detail.id));
}

/** @param {EditorViewHost} host */
function openFromUrl(host) {
  if (host.projectId && host.adaptationId) enterEditor(host.projectId, host.adaptationId);
}

/** The export dialog was closed. */
function handleExportClose() {
  setExportOpen(false);
}

/** @param {EditorViewHost} host @returns {any} */
function layoutTemplate({ layout, page }) {
  const tab = dockTabOf(layout.dockTab);
  return html`
    <div
      class="editor-view"
      data-sheet="${layout.sheetOpen ? 'open' : 'closed'}"
      style="${layoutVars(layout)}"
      onsplitstart="${handleSplit}"
      onsplitmove="${handleSplit}"
      onsplitend="${handleSplit}"
      onsplitkey="${handleSplit}"
      onsplitreset="${handleSplit}"
    >
      <app-editor-bar class="editor-view-bar"></app-editor-bar>
      <section
        class="editor-view-dock panel"
        aria-label="Panels"
        onmedia-transcript="${handleTranscript}"
      >
        <app-splitter class="editor-view-grip" data-pane="sheet" label="Resize the panel">
        </app-splitter>
        <app-tabs
          class="editor-view-tabs"
          tabs="${TABS}"
          active="${tab}"
          label="Panels"
          panel-prefix="editor-dock-"
          ontabchange="${handleTab}"
        ></app-tabs>
        ${dockPanels(tab)}
      </section>
      <app-splitter
        class="editor-view-split-dock"
        data-pane="dock"
        orientation="vertical"
        label="Resize the side panel"
      ></app-splitter>
      <section class="editor-view-stage" aria-label="Preview">
        <video-preview></video-preview>
        <transport-controls></transport-controls>
      </section>
      <app-splitter
        class="editor-view-split-timeline"
        data-pane="timeline"
        label="Resize the timeline"
      >
      </app-splitter>
      <section class="editor-view-timeline" aria-label="Timeline">
        <timeline-panel></timeline-panel>
      </section>
      <app-tabs
        class="editor-view-tabbar"
        variant="bar"
        tabs="${TABS}"
        active="${layout.sheetOpen ? tab : ''}"
        label="Panels"
        panel-prefix="editor-dock-"
        ontabchange="${handleBarTab}"
      ></app-tabs>
      ${page.status === 'ready' ? html`` : veilTemplate()}
    </div>
    <export-dialog open="${page.exportOpen}" onclose="${handleExportClose}"></export-dialog>
  `;
}

/** @type {import('hybrids').Component<EditorViewHost>} */
export default define({
  tag: 'editor-view',
  [router.connect]: { url: '/editor/:projectId/:adaptationId' },
  projectId: '',
  adaptationId: { value: '', observe: openFromUrl },
  layout: store(AppState),
  page: watch(editorPageState),
  render: {
    value: (host) =>
      host.page.status === 'failed'
        ? failureTemplate(host.page, host.projectId, openFromUrl)
        : layoutTemplate(host),
    shadow: false,
    connect: () => () => {
      leaveEditor();
    },
  },
});
