/**
 * The Create tab's entry for captions, under Text: someone looking for
 * words on the picture finds them here. Captions are not a clip to add —
 * they are switched on for the speech that is already on the timeline — so
 * the tile, which shows the timeline's caption style at work (it moves
 * while pointed at or focused), captions all speech when pressed. What
 * happened is announced as a bubbling `captions-status` event
 * (`{ message }`); the message on screen leads on to the style.
 * @module components/molecules/captions-create
 */

import { define, dispatch, html } from 'hybrids';
import { captionAll } from '#utils/captionsUi/actions.js';
import { presetOf } from '#utils/captionsUi/styleControls.js';
import { tilePicture } from '#utils/captionsUi/styleParts.js';
import { prefersStill } from '#utils/captionsUi/tileClock.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import '#atoms/caption-tile/caption-tile.js';

/**
 * @typedef {Object} CaptionsCreateHost
 * @property {any} doc - The open document (its caption style shows on the tile)
 * @property {boolean} lively - The tile is pointed at or focused: it moves
 * @property {boolean} busy - Transcripts are being read
 */

/** @typedef {CaptionsCreateHost & HTMLElement} Host */

/** @param {Host} host @param {string} message */
const say = (host, message) =>
  dispatch(host, 'captions-status', { detail: { message }, bubbles: true });

/** The tile was pressed. @param {Host} host */
function handlePress(host) {
  if (host.busy) return;
  host.busy = true;
  say(host, 'Looking for speech with a transcript…');
  captionAll()
    .then(
      (report) => say(host, [report.title, report.detail].filter(Boolean).join(' — ')),
      (err) => say(host, `Captions could not be switched on: ${err.message}`),
    )
    .finally(() => (host.busy = false));
}

/** @param {Host} host */
function handleEnter(host) {
  host.lively = true;
}

/** @param {Host} host */
function handleLeave(host) {
  host.lively = false;
}

/** @type {import('hybrids').Component<CaptionsCreateHost>} */
export default define({
  tag: 'captions-create',
  doc: liveDoc(),
  lively: false,
  busy: false,
  render: {
    value: ({ doc, lively, busy }) => {
      const stored = doc.captions?.style;
      const preset = presetOf(stored);
      const own = stored !== null && typeof stored === 'object' ? stored : {};
      return html`
        <div class="field-group-title">Captions</div>
        <div class="captions-create-entry">
          <button
            type="button"
            class="create-panel-tile captions-create-tile"
            title="Caption all speech: switch captions on for every sound clip that has a transcript"
            aria-busy="${busy ? 'true' : 'false'}"
            onclick="${handlePress}"
            onpointerenter="${handleEnter}"
            onpointerleave="${handleLeave}"
            onfocus="${handleEnter}"
            onblur="${handleLeave}"
          >
            ${tilePicture(preset.name, own, doc.fonts || [], lively && !prefersStill())}
            <span class="create-panel-name">Caption all speech</span>
          </button>
          <p class="captions-create-about">
            Words on screen as they are spoken, a few at a time, from each clip’s transcript —
            nothing to type or lay out. The style (${preset.label}) is in the Inspector.
          </p>
        </div>
      `;
    },
    shadow: false,
  },
});
