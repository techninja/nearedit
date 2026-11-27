/**
 * Clip inspector — the properties of the current selection, edited in
 * place. One clip, a linked picture + sound pair, or many clips at once
 * (shared values show, differing ones read "mixed", a change applies to
 * every clip it means something for). With nothing selected it shows the
 * document instead. Every interaction with a field is one undo step.
 * @module components/organisms/clip-inspector
 */

import { define, html, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { applyChange } from '#utils/inspector/apply.js';
import { containTyping } from '#utils/inspector/fieldEvents.js';
import { cancelEdit, commitEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { documentSummary } from '#utils/inspector/summary.js';
import { sourceDurations } from '#utils/media/library.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/inspector-clip/inspector-clip.js';
import '#molecules/inspector-document/inspector-document.js';
import '#molecules/inspector-motion/inspector-motion.js';
import '#molecules/inspector-text/inspector-text.js';
import '#molecules/inspector-timing/inspector-timing.js';
import '#molecules/inspector-transform/inspector-transform.js';

/**
 * @typedef {Object} ClipInspectorHost
 * @property {any} doc - The current document
 * @property {string[]} selection - Selected clip ids
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 */

/**
 * A field reported a change: edit the document. Live changes (typing,
 * stepping, scrubbing, dragging a slider) are previewed inside one gesture
 * and recorded as a single undo step when the interaction ends.
 * @param {ClipInspectorHost & HTMLElement} _host
 * @param {CustomEvent<import('#utils/inspector/fieldEvents.js').FieldChangeDetail>} event
 */
function handleFieldChange(_host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  if (phase === 'cancel') return cancelEdit();
  const selection = getSelection();
  const opts = { sourceDurations: sourceDurations(), autoCrossfade: getView().autoCrossfade };
  /** @type {(doc: any) => any} */
  const operation = (doc) => applyChange(doc, selection, { name, value }, opts);
  if (phase === 'live') liveEdit(name, operation, /** @type {Element} */ (event.target));
  else commitEdit(name, operation);
}

/**
 * Re-read the selection only when it really changed: view state also
 * changes on every playback frame.
 * @param {HTMLElement} _host
 * @param {string} _key
 * @param {() => void} invalidate
 * @returns {() => void}
 */
function watchSelection(_host, _key, invalidate) {
  return store.observe(ViewState, (_id, view, last) => {
    if ((view?.selection || []).join() !== (last?.selection || []).join()) invalidate();
  });
}

/** @type {import('hybrids').Component<ClipInspectorHost>} */
export default define({
  tag: 'clip-inspector',
  doc: {
    value: () => getDoc(),
    connect: (_host, _key, invalidate) => {
      const stop = onDocChange(invalidate);
      return () => {
        stop();
        finishEdit();
      };
    },
  },
  selection: { value: () => getSelection(), connect: watchSelection },
  project: store(ProjectState),
  render: {
    value: ({ doc, selection, project }) => {
      const model = inspectorModel(doc, selection);
      return html`
        <div
          class="clip-inspector panel"
          onfield-change="${handleFieldChange}"
          onkeydown="${containTyping}"
        >
          ${model.count === 0
            ? html`<div class="panel-body">
                <inspector-document
                  summary="${documentSummary(doc)}"
                  project="${project.projectName}"
                  adaptation="${project.adaptationName}"
                ></inspector-document>
              </div>`
            : html`
                <header class="clip-inspector-header">
                  <div class="clip-inspector-heading" title="${model.heading}">
                    ${model.heading}
                  </div>
                  <div class="clip-inspector-detail">${model.detail}</div>
                  ${model.locked &&
                  html`<div class="clip-inspector-locked">
                    <app-icon name="lock" size="sm"></app-icon> On a locked track — unlock it to
                    edit
                  </div>`}
                </header>
                <div class="panel-body">
                  <inspector-clip model="${model}"></inspector-clip>
                  <inspector-timing model="${model}"></inspector-timing>
                  <inspector-text model="${model}"></inspector-text>
                  <inspector-transform model="${model}"></inspector-transform>
                  <inspector-motion model="${model}"></inspector-motion>
                </div>
              `}
        </div>
      `;
    },
    shadow: false,
  },
});
