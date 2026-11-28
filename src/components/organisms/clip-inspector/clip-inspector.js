/**
 * Clip inspector — the properties of the current selection, edited in
 * place. One clip, a linked picture + sound pair, or many clips at once
 * (shared values show, differing ones read "mixed", a change applies to
 * every clip it means something for): timing, text, generator, transform,
 * effect stack, and a keyframe strip for what is animated. Values are
 * those at the playhead, and editing an animated one sets a key there.
 * With no clip selected it shows the focused track (opacity, blend mode,
 * effects), else the document. Every interaction is one undo step.
 * @module components/organisms/clip-inspector
 */

import { define, html, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { containTyping } from '#utils/inspector/fieldEvents.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import * as on from '#utils/inspector/inspectorEvents.js';
import { clipsView, trackView } from '#utils/inspector/inspectorParts.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { documentSummary } from '#utils/inspector/summary.js';
import { trackModel } from '#utils/inspector/trackSubject.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/inspector-clip/inspector-clip.js';
import '#molecules/inspector-crop/inspector-crop.js';
import '#molecules/inspector-document/inspector-document.js';
import '#molecules/inspector-effects/inspector-effects.js';
import '#molecules/inspector-generator/inspector-generator.js';
import '#molecules/inspector-motion/inspector-motion.js';
import '#molecules/inspector-text/inspector-text.js';
import '#molecules/inspector-text-motion/inspector-text-motion.js';
import '#molecules/inspector-text-style/inspector-text-style.js';
import '#molecules/inspector-timing/inspector-timing.js';
import '#molecules/inspector-track/inspector-track.js';
import '#molecules/inspector-transform/inspector-transform.js';
import '#molecules/keyframe-strip/keyframe-strip.js';
import '#molecules/web-inspector/web-inspector.js';

/**
 * @typedef {Object} ClipInspectorHost
 * @property {any} doc - The current document
 * @property {{ selection: string[], trackId: string, time: number }} view - What
 *   of the view state the inspector shows
 * @property {number} copied - Effect stacks copied so far (wakes the paste button)
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 */

/** While playing, animated values follow the playhead this often (ms). */
const PLAYING_INTERVAL = 120;

/**
 * Re-read the view only when what the inspector shows changed: the
 * selection, the focused track, or — while a selected clip is animated —
 * the playhead. View state also changes on every playback frame.
 * @param {HTMLElement} _host
 * @param {string} _key
 * @param {() => void} invalidate
 * @returns {() => void}
 */
function watchView(_host, _key, invalidate) {
  let updated = 0;
  return store.observe(ViewState, (_id, view, last) => {
    const picked =
      (view?.selection || []).join() !== (last?.selection || []).join() ||
      view?.activeTrackId !== last?.activeTrackId;
    if (picked) return invalidate();
    if (view.playheadPosition === last?.playheadPosition || !on.followsPlayhead()) return;
    const now = performance.now();
    if (view.playing && now - updated < PLAYING_INTERVAL) return;
    updated = now;
    invalidate();
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
  view: {
    value: () => ({
      selection: getSelection(),
      trackId: getView().activeTrackId || '',
      time: getView().playheadPosition || 0,
    }),
    connect: watchView,
  },
  copied: 0,
  project: store(ProjectState),
  render: {
    value: ({ doc, view, project, copied }) => {
      const model = inspectorModel(doc, view.selection, view.time);
      const track = model.count ? null : trackModel(doc, view.trackId);
      const documentView = html`<inspector-document
        summary="${documentSummary(doc)}"
        project="${project.projectName}"
        adaptation="${project.adaptationName}"
      ></inspector-document>`;
      return html`
        <div
          class="clip-inspector panel"
          data-copied="${copied}"
          onfield-change="${on.handleFieldChange}"
          onkeyframe-action="${on.handleKeyframeAction}"
          oneffect-action="${on.handleEffectAction}"
          onkeydown="${containTyping}"
        >
          ${model.count
            ? clipsView(model)
            : track
              ? trackView(track, documentView)
              : html`<div class="panel-body">${documentView}</div>`}
        </div>
      `;
    },
    shadow: false,
  },
});
