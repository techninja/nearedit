/**
 * In/out marks toolbar of the quick look: mark in, mark out, clear, the
 * marked range in words, and "add to timeline". A changed mark is announced
 * with a bubbling `media-marks` event, an add request with `media-add`.
 * @module components/molecules/media-marks
 */

import { define, dispatch, html } from 'hybrids';
import { NO_ITEM, formatSeconds } from '#utils/media/format.js';
import { getMarks, markFile, markedRange } from '#utils/media/ranges.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaMarksHost
 * @property {import('#utils/media/library.js').MediaItem} item
 * @property {number} time - Preview position the marks are set at
 * @property {number} revision - Changes when the marks changed elsewhere
 */

/** @typedef {MediaMarksHost & HTMLElement} Host */

/** @param {Host} host @param {Event} event */
function handleMark(host, event) {
  const edge = /** @type {HTMLElement} */ (event.currentTarget).dataset.edge;
  markFile(host.item.filePath, /** @type {any} */ (edge), host.time, host.item.duration);
  dispatch(host, 'media-marks', { detail: { path: host.item.filePath }, bubbles: true });
}

/** @param {Host} host */
function handleAdd(host) {
  dispatch(host, 'media-add', { detail: { path: host.item.filePath }, bubbles: true });
}

/**
 * @param {import('#utils/media/library.js').MediaItem} item
 * @returns {string} The marked range in words
 */
function describeRange(item) {
  const range = markedRange(getMarks(item.filePath), item.duration);
  if (!range) return 'Whole file';
  const end = range.sourceOut ?? item.duration;
  const length = Number.isFinite(end) ? ` · ${formatSeconds(end - range.sourceIn)}` : '';
  return `${formatSeconds(range.sourceIn)} – ${Number.isFinite(end) ? formatSeconds(end) : 'end'}${length}`;
}

/** @type {import('hybrids').Component<MediaMarksHost>} */
export default define({
  tag: 'media-marks',
  item: { value: NO_ITEM },
  time: 0,
  revision: 0,
  render: {
    // `revision` is read so the read-out follows marks set with the keyboard.
    value: ({ item, revision }) => {
      const timed = item.type === 'video' || item.type === 'audio';
      const marked = revision >= 0 && markedRange(getMarks(item.filePath), item.duration);
      return html`
        <div class="media-marks toolbar-group">
          ${timed &&
          html`
            <button
              type="button"
              class="icon-btn"
              data-edge="in"
              title="Mark in (I)"
              onclick="${handleMark}"
            >
              <app-icon name="step-back" size="sm"></app-icon> In
            </button>
            <button
              type="button"
              class="icon-btn"
              data-edge="out"
              title="Mark out (O)"
              onclick="${handleMark}"
            >
              Out <app-icon name="step-forward" size="sm"></app-icon>
            </button>
            <span class="media-marks-range" aria-live="polite">${describeRange(item)}</span>
            <button
              type="button"
              class="icon-btn"
              data-edge="clear"
              title="Clear the marks"
              aria-label="Clear the marks"
              disabled="${!marked}"
              onclick="${handleMark}"
            >
              <app-icon name="x" size="sm"></app-icon>
            </button>
          `}
          <span class="toolbar-spacer"></span>
          ${item.type !== 'text' &&
          html`<button
            type="button"
            class="icon-btn media-marks-add"
            title="Add to the timeline at the cursor"
            onclick="${handleAdd}"
          >
            <app-icon name="plus" size="sm"></app-icon> ${marked ? 'Add part' : 'Add'}
          </button>`}
        </div>
      `;
    },
    shadow: false,
  },
});
