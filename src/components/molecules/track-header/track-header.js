/**
 * Track header — one track's controls, left of its lane: name (edit in
 * place), mute (hide for video), solo, lock, volume for audio tracks, and
 * an options button. The options menu itself belongs to the track list:
 * the button dispatches `trackmenu` (detail: `{ trackId, x, y }`).
 * @module components/molecules/track-header
 */

import { html, define, dispatch } from 'hybrids';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { setView } from '#utils/editor/view.js';
import { releasePointerFocus } from '#utils/keyboard/focus.js';
import { renameTrackTo, toggleTrackFlag } from '#utils/timeline/trackActions.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/track-volume/track-volume.js';

/**
 * @typedef {Object} TrackHeaderHost
 * @property {string} trackId
 * @property {boolean} active - The track paste and insert aim at
 * @property {any} doc - The current document
 */

/** @typedef {TrackHeaderHost & HTMLElement} Host */

/** @param {Host} host */
const handleActivate = (host) => setView({ activeTrackId: host.trackId });

/**
 * Mute / solo / lock: the button names its flag in `data-flag`.
 * @param {Host} host
 * @param {MouseEvent} event
 */
function handleToggle(host, event) {
  const { flag } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  toggleTrackFlag(host.trackId, /** @type {'muted'|'solo'|'locked'} */ (flag));
  releasePointerFocus(event);
}

/**
 * @param {Host} host
 * @param {Event} event
 */
function handleRename(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  input.value = renameTrackTo(host.trackId, input.value);
}

/**
 * Enter commits the name, Escape restores it.
 * @param {Host} _host
 * @param {KeyboardEvent} event
 */
function handleNameKey(_host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (event.key === 'Escape') input.value = '';
  if (event.key === 'Enter' || event.key === 'Escape') input.blur();
}

/**
 * Ask for the options menu, just below the button.
 * @param {Host} host
 * @param {MouseEvent} event
 */
function handleMore(host, event) {
  const rect = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
  const detail = { trackId: host.trackId, x: rect.left, y: rect.bottom + 2 };
  dispatch(host, 'trackmenu', { detail, bubbles: true });
  releasePointerFocus(event);
}

/**
 * A toggle button for one of the track's flags.
 * @param {'muted'|'solo'|'locked'} flag
 * @param {string} label - Accessible name and tooltip
 * @param {string} icon
 * @param {boolean} pressed
 */
function toggle(flag, label, icon, pressed) {
  return html`
    <button
      type="button"
      class="icon-btn"
      data-flag="${flag}"
      aria-label="${label}"
      title="${label}"
      aria-pressed="${String(pressed)}"
      onclick="${handleToggle}"
    >
      <app-icon name="${icon}" size="sm"></app-icon>
    </button>
  `;
}

/** @type {import('hybrids').Component<TrackHeaderHost>} */
export default define({
  tag: 'track-header',
  trackId: '',
  active: false,
  doc: liveDoc(),
  render: {
    value: ({ trackId, active, doc }) => {
      const track = doc.tracks.find((candidate) => candidate.trackId === trackId);
      if (!track) return html``;
      const audio = track.type === 'audio';
      const { muted, solo, locked, volume } = track;
      const muteIcon = audio ? (muted ? 'mute' : 'volume') : muted ? 'hidden' : 'visible';
      const classes = { 'track-header': true, audio, active, locked };
      return html`
        <div class="${classes}" onpointerdown="${handleActivate}">
          <input
            class="track-header-name"
            aria-label="Track name"
            title="Rename track"
            spellcheck="false"
            value="${track.name}"
            onchange="${handleRename}"
            onkeydown="${handleNameKey}"
          />
          <div class="track-header-buttons">
            ${toggle('muted', audio ? 'Mute' : 'Hide', muteIcon, muted)}
            ${toggle('solo', 'Solo', 'solo', solo)}
            ${toggle('locked', 'Lock', locked ? 'lock' : 'unlock', locked)}
            <button
              type="button"
              class="icon-btn"
              aria-label="Track options"
              aria-haspopup="menu"
              title="Track options"
              onclick="${handleMore}"
            >
              <app-icon name="more" size="sm"></app-icon>
            </button>
          </div>
          ${audio && html`<track-volume track-id="${trackId}" value="${volume}"></track-volume>`}
        </div>
      `;
    },
    shadow: false,
  },
});
