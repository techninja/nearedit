/**
 * Transport controls — go to start, frame step, play/pause, stop, go to
 * end, loop, and a `HH:MM:SS:FF` readout with the total duration. Every
 * button calls the transport; this component holds no playback state.
 * @module components/atoms/transport-controls
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import * as transport from '#utils/playback/transport.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TransportControlsHost
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline - Summary of the
 *   document, replaced whenever it changes
 * @property {import('#store/ViewState.js').ViewStateShape} view
 */

/** Play, or pause where playback is (the Stop button returns to the cursor). */
function handlePlayPause() {
  transport.toggle({ returnToCursor: false });
}

/** Step one frame back. */
function handleStepBack() {
  transport.stepFrames(-1);
}

/** Step one frame forward. */
function handleStepForward() {
  transport.stepFrames(1);
}

/** Toggle looping. */
function handleLoop() {
  transport.setLoop();
}

/**
 * One icon button.
 * @param {string} icon - Key of src/icons.json
 * @param {string} label - Accessible name
 * @param {string} hint - Tooltip, with the keyboard shortcut
 * @param {() => void} action
 * @returns {import('hybrids').UpdateFunctionWithMethods<TransportControlsHost>}
 */
function button(icon, label, hint, action) {
  return html`
    <button
      type="button"
      class="transport-button"
      aria-label="${label}"
      title="${hint}"
      onclick="${action}"
    >
      <app-icon name="${icon}" size="sm"></app-icon>
    </button>
  `;
}

// The icon atom resolves its artwork once, when it connects, so play and
// pause are two separate templates that hybrids swaps rather than one
// `<app-icon>` whose name changes.
const PLAY_ICON = html`<app-icon name="play" size="sm"></app-icon>`;
const PAUSE_ICON = html`<app-icon name="pause" size="sm"></app-icon>`;

/** @type {import('hybrids').Component<TransportControlsHost>} */
export default define({
  tag: 'transport-controls',
  timeline: store(TimelineState),
  view: store(ViewState),
  render: {
    value: ({ timeline, view }) => html`
      <div class="transport-controls" role="toolbar" aria-label="Transport">
        ${button('skip-back', 'Go to start', 'Go to start (Home)', transport.goToStart)}
        ${button('step-back', 'Previous frame', 'Previous frame (←)', handleStepBack)}
        <button
          type="button"
          class="transport-button transport-play"
          aria-label="${view.playing ? 'Pause' : 'Play'}"
          title="${view.playing ? 'Pause (Enter)' : 'Play (Space / Enter)'}"
          onclick="${handlePlayPause}"
        >
          ${view.playing ? PAUSE_ICON : PLAY_ICON}
        </button>
        ${button('stop', 'Stop', 'Stop and return to the cursor (K)', transport.stop)}
        ${button('step-forward', 'Next frame', 'Next frame (→)', handleStepForward)}
        ${button('skip-forward', 'Go to end', 'Go to end (End)', transport.goToEnd)}
        <button
          type="button"
          class="transport-button transport-loop"
          aria-label="Loop playback"
          aria-pressed="${view.loopEnabled ? 'true' : 'false'}"
          title="Loop playback"
          onclick="${handleLoop}"
        >
          <app-icon name="loop" size="sm"></app-icon>
        </button>
        <span class="transport-time">
          <span class="transport-timecode" role="timer" aria-label="Playhead position"
            >${formatTimecode(view.playheadPosition, timeline.fps)}</span
          >
          <span class="transport-duration" aria-label="Duration"
            >/ ${formatTimecode(timeline.duration, timeline.fps)}</span
          >
        </span>
      </div>
    `,
    shadow: false,
  },
});
