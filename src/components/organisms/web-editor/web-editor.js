/**
 * Web editor organism — the dialog in which one web clip is made and
 * perfected without reading its recipe: the address and page size on top;
 * the page as it stands before the selected step, with everything on it
 * that can be pressed to add a click, a hover, typing, a scroll, a
 * highlight or a zoom; the steps and the selected step's fields; a score
 * strip to retime them; and Record, with progress, after which the
 * recording plays right here. Every change edits the clip's recipe
 * through the edit session, so undo works and autosave keeps it. Opened by
 * `openWebEditor(clipId)` (`#utils/webUi/editorState.js`); a recording that
 * is under way carries on when the dialog closes.
 * @module components/organisms/web-editor
 */

import { define, html } from 'hybrids';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import { captureState, loadCaptureStatus } from '#utils/webUi/captureStatus.js';
import { webClipName, webClipStatus } from '#utils/webUi/clipStatus.js';
import * as on from '#utils/webUi/editorEvents.js';
import { editorBody } from '#utils/webUi/editorParts.js';
import * as picks from '#utils/webUi/editorPicks.js';
import { shownSelection, webClipOf, webEditorState } from '#utils/webUi/editorState.js';
import * as view from '#utils/webUi/editorView.js';
import { recordingState, watchWebJobs } from '#utils/webUi/recording.js';
import { snapshotState } from '#utils/webUi/snapshot.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';
import '#molecules/app-tabs/index.js';
import '#molecules/timeline-menu/timeline-menu.js';
import '#molecules/web-element-list/index.js';
import '#molecules/web-page-map/index.js';
import '#molecules/web-playback/index.js';
import '#molecules/web-record-bar/index.js';
import '#molecules/web-score-strip/index.js';
import '#molecules/web-step-form/index.js';
import '#molecules/web-step-list/index.js';
import '#molecules/web-topbar/index.js';

/** @typedef {import('#utils/webUi/editorView.js').WebEditorHost} WebEditorHost */

/** While the editor page is up: attach recordings as their jobs finish. */
function connectServices() {
  loadCaptureStatus();
  return watchWebJobs();
}

/** @param {WebEditorHost} host */
function dialog(host) {
  const { state, doc, snap, recordings, capture } = host;
  const found = webClipOf(state.clipId);
  if (!found) return html``;
  const { clip, track } = found;
  const { recipe } = clip.web;
  const fps = doc.fps || 30;
  const recording = recordings.byClip[clip.clipId] || null;
  const status = webClipStatus(clip, fps, recording);
  const locked = Boolean(track.locked);
  const facts = { clip, locked, recipe, selected: shownSelection(state, recipe), fps, status };
  const body = html`<div
      class="web-editor-body"
      data-tab="${state.tab}"
      onfield-change="${on.handleFieldChange}"
      onweb-select="${on.handleSelect}"
      onweb-step="${on.handleStep}"
      onweb-step-add="${on.handleStepAdd}"
      onweb-retime="${on.handleRetime}"
      onweb-refresh="${on.handleRefresh}"
      onweb-pick="${picks.handlePick}"
      onweb-pick-field="${picks.handlePickField}"
      onweb-seek="${view.handleSeek}"
      onweb-time="${view.handleTime}"
      onkeydown="${view.handleKeys}"
    >
      ${editorBody(host, facts)}
    </div>
    <div class="web-editor-menu" onkeydown="${view.handleMenuKeys}">
      <timeline-menu
        open="${Boolean(state.menu)}"
        x="${state.menu?.x || 0}"
        y="${state.menu?.y || 0}"
        items="${picks.pickMenu(state.menu, snap.snapshot)}"
        onmenuclose="${picks.handleMenuClose}"
      ></timeline-menu>
    </div>`;
  const footer = html`<web-record-bar
      status="${status}"
      recording="${recording}"
      capture="${capture}"
      locked="${locked}"
      onweb-record="${on.handleRecord}"
      onweb-cancel="${on.handleCancel}"
    ></web-record-bar>
    <button type="button" class="btn btn-secondary" onclick="${on.handleClose}">Done</button>`;
  const title = `Web clip — ${webClipName(clip)}`;
  return html`<app-dialog open onclose="${on.handleClose}">
    ${dialogFrame({ title, body, footer, size: 'huge', onClose: on.handleClose })}
  </app-dialog>`;
}

/** @type {import('hybrids').Component<WebEditorHost>} */
export default define({
  tag: 'web-editor',
  state: watch(webEditorState),
  doc: liveDoc(),
  snap: watch(snapshotState),
  recordings: watch(recordingState),
  capture: watch(captureState),
  playhead: -1,
  seek: { value: { time: 0, n: 0 } },
  listOpen: false,
  services: { value: true, connect: connectServices },
  render: {
    value: (host) => (host.state.clipId ? dialog(host) : html``),
    shadow: false,
    observe: view.sync,
  },
});
