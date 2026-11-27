/**
 * Track volume — the gain slider of an audio track (0 to 200 %). Dragging
 * it previews live and undoes as one step.
 * @module components/atoms/track-volume
 */

import { html, define } from 'hybrids';
import { commitTrackVolume, previewTrackVolume } from '#utils/timeline/trackActions.js';

/**
 * @typedef {Object} TrackVolumeHost
 * @property {string} trackId
 * @property {number} value - Linear gain 0..2
 */

/**
 * @param {TrackVolumeHost & HTMLElement} host
 * @param {Event} event
 */
function handleInput(host, event) {
  previewTrackVolume(host.trackId, Number(/** @type {HTMLInputElement} */ (event.target).value));
}

/** The slider was released (or stepped with the keyboard): one undo step. */
function handleChange() {
  commitTrackVolume();
}

/**
 * A slider moved with the pointer gives the focus back, so the arrow keys
 * step frames again instead of nudging the volume.
 * @param {TrackVolumeHost & HTMLElement} _host
 * @param {PointerEvent} event
 */
function handleRelease(_host, event) {
  /** @type {HTMLElement} */ (event.currentTarget).blur();
}

/** @type {import('hybrids').Component<TrackVolumeHost>} */
export default define({
  tag: 'track-volume',
  trackId: '',
  value: 1,
  render: {
    value: ({ value }) => html`
      <input
        type="range"
        class="field-range"
        aria-label="Volume"
        title="${`Volume ${Math.round(value * 100)}%`}"
        min="0"
        max="2"
        step="0.01"
        value="${value}"
        oninput="${handleInput}"
        onchange="${handleChange}"
        onpointerup="${handleRelease}"
      />
    `,
    shadow: false,
  },
});
