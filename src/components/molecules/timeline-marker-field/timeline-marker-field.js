/**
 * Marker field — the inline text field that renames a marker, shown in the
 * ruler at the marker's position. Enter or leaving the field commits,
 * Escape abandons; either way it dispatches `done`.
 * @module components/molecules/timeline-marker-field
 */

import { html, define, dispatch, store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { renameMarker } from '#utils/edl/index.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { edit } from '#utils/editor/session.js';
import { currentViewport } from '#utils/timeline/scroll.js';
import { timeToX } from '#utils/timeline/viewport.js';

/**
 * @typedef {Object} TimelineMarkerFieldHost
 * @property {string} markerId - Marker being renamed; '' hides the field
 * @property {any} doc - The current document
 * @property {import('#store/ViewState.js').ViewStateShape} view
 */

/** @type {WeakSet<HTMLElement>} Fields that have already reported `done` */
const finished = new WeakSet();

/**
 * Commit (change, blur, Enter) or abandon (Escape) the rename.
 * @param {TimelineMarkerFieldHost & HTMLElement} host
 * @param {Event & { key?: string }} event
 */
function handleInput(host, event) {
  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== 'Escape') return;
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (finished.has(input)) return;
  finished.add(input);
  const { markerId } = host;
  const label = input.value.trim();
  if (event.key !== 'Escape') edit((doc) => renameMarker(doc, markerId, label));
  dispatch(host, 'done', { bubbles: true });
}

/**
 * Put the caret in a field that just appeared, with its text selected.
 * @param {TimelineMarkerFieldHost & HTMLElement} host
 */
function focusField(host) {
  const input = host.querySelector('input');
  if (input && document.activeElement !== input && !finished.has(input)) input.select();
}

/** @type {import('hybrids').Component<TimelineMarkerFieldHost>} */
export default define({
  tag: 'timeline-marker-field',
  markerId: '',
  doc: liveDoc(),
  view: store(ViewState),
  render: {
    value: ({ markerId, doc, view }) => {
      const marker = markerId && (doc.markers || []).find((m) => m.markerId === markerId);
      if (!marker) return html``;
      const left = Math.max(0, timeToX(currentViewport(view), marker.time));
      return html`
        <input
          class="field-input timeline-marker-field"
          aria-label="Marker name"
          placeholder="Marker name"
          style="${{ left: `${left}px` }}"
          value="${marker.label}"
          onchange="${handleInput}"
          onkeydown="${handleInput}"
          onblur="${handleInput}"
        />
      `.key(markerId);
    },
    shadow: false,
    observe: focusField,
  },
});
