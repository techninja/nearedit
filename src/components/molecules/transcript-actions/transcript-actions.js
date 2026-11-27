/**
 * What can be done with the selected words: cut them out of the timeline,
 * keep only them, add them as a new clip, drop a marker, copy the text,
 * correct a word. Always on screen (disabled without a selection), so
 * selecting a word never moves the text under the pointer. Reports the
 * chosen action with a bubbling `transcript-action` event (`{ action }`).
 * @module components/molecules/transcript-actions
 */

import { define, dispatch, html } from 'hybrids';
import { formatSeconds } from '#utils/media/format.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TranscriptActionsHost
 * @property {number} count - Selected units
 * @property {number} seconds - Length of the selection in the source
 * @property {boolean} editable - The file is on the timeline, on an unlocked track
 * @property {boolean} placed - The first selected word is in the edit (a marker can be put on it)
 * @property {boolean} extend - Taps extend the selection (touch)
 * @property {string} unit - What is selected: `word` or `phrase`
 */

/** @typedef {TranscriptActionsHost & HTMLElement} Host */

/** @param {Host} host @param {Event} event */
function handleAction(host, event) {
  const { action } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'transcript-action', { detail: { action }, bubbles: true });
}

/**
 * @param {string} action
 * @param {string} icon
 * @param {string} label - Shown next to the icon; with `iconOnly` it is the accessible name
 * @param {string} hint
 * @param {boolean} enabled
 * @param {boolean} [iconOnly]
 * @returns {import('hybrids').UpdateFunctionWithMethods<TranscriptActionsHost>}
 */
function button(action, icon, label, hint, enabled, iconOnly = false) {
  return html`<button
    type="button"
    class="icon-btn"
    data-action="${action}"
    title="${hint}"
    aria-label="${label}"
    disabled="${!enabled}"
    onclick="${handleAction}"
  >
    <app-icon name="${icon}" size="sm"></app-icon> ${iconOnly ? '' : label}
  </button>`;
}

/** @type {import('hybrids').Component<TranscriptActionsHost>} */
export default define({
  tag: 'transcript-actions',
  count: 0,
  seconds: 0,
  editable: false,
  placed: false,
  extend: false,
  unit: 'word',
  render: {
    value: ({ count, seconds, editable, placed, extend, unit }) => {
      const some = count > 0;
      return html`
        <span class="toolbar-group">
          ${button(
            'cut',
            'split',
            'Cut',
            'Remove these words from the timeline and close the gap (Delete)',
            some && editable,
          )}
          ${button('keep', 'crop', 'Keep only', 'Trim the clip to these words', some && editable)}
          ${button('add', 'plus', 'Add', 'Insert these words as a new clip at the cursor', some)}
          ${button(
            'marker',
            'marker',
            'Marker',
            'Put a marker where these words play',
            some && placed,
          )}
        </span>
        <span class="toolbar-group">
          ${button('copy', 'copy', 'Copy', 'Copy these words as text (Ctrl+C)', some, true)}
          ${button(
            'edit',
            'edit',
            'Correct',
            'Correct a mis-heard word — the timing stays (double-click, F2)',
            count === 1,
            true,
          )}
          <button
            type="button"
            class="icon-btn"
            data-action="extend"
            aria-pressed="${extend ? 'true' : 'false'}"
            title="Extend the selection with the next tap (or Shift+click)"
            aria-label="Extend the selection"
            disabled="${!some}"
            onclick="${handleAction}"
          >
            <app-icon name="trim" size="sm"></app-icon>
          </button>
          ${button('clear', 'x', 'Clear the selection', 'Clear the selection (Esc)', some, true)}
        </span>
        <span class="transcript-actions-summary" aria-live="polite"
          >${some
            ? `${count} ${unit}${count === 1 ? '' : 's'} · ${formatSeconds(seconds)}`
            : `Select ${unit}s to edit`}</span
        >
      `;
    },
    shadow: false,
  },
});
