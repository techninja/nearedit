/**
 * Track list — the column left of the timeline canvas: the playhead
 * timecode in the corner beside the ruler, then one header per track,
 * scrolled vertically in step with the lanes, and the track options menu.
 * @module components/organisms/track-list
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { scrollBy } from '#utils/timeline/scroll.js';
import { trackMenu } from '#utils/timeline/trackMenu.js';
import '#molecules/timeline-menu/timeline-menu.js';
import '#molecules/track-header/track-header.js';

/**
 * @typedef {Object} TrackListHost
 * @property {any} timeline - The document (TimelineState)
 * @property {import('#store/ViewState.js').ViewStateShape} view
 * @property {{ open: boolean, x: number, y: number, trackId: string }} menu - Options menu state
 */

/** @typedef {TrackListHost & HTMLElement} Host */

const MENU_CLOSED = { open: false, x: 0, y: 0, trackId: '' };

/**
 * The wheel over the headers scrolls the tracks.
 * @param {Host} _host
 * @param {WheelEvent} event
 */
function handleWheel(_host, event) {
  event.preventDefault();
  scrollBy(0, event.deltaY);
}

/**
 * A header asked for its options menu.
 * @param {Host} host
 * @param {CustomEvent<{ trackId: string, x: number, y: number }>} event
 */
function handleTrackMenu(host, event) {
  host.menu = { open: true, ...event.detail };
}

/** @param {Host} host */
function handleMenuClose(host) {
  host.menu = MENU_CLOSED;
}

/** @type {import('hybrids').Component<TrackListHost>} */
export default define({
  tag: 'track-list',
  timeline: store(TimelineState),
  view: store(ViewState),
  menu: { value: MENU_CLOSED },
  render: {
    value: ({ timeline, view, menu }) => html`
      <div class="track-list" onwheel="${handleWheel}" ontrackmenu="${handleTrackMenu}">
        <div class="track-list-corner">
          <span role="timer" aria-label="Playhead position"
            >${formatTimecode(view.playheadPosition, timeline.fps)}</span
          >
        </div>
        <div class="track-list-headers">
          <div style="${{ transform: `translateY(${-view.scrollY}px)` }}">
            ${timeline.tracks.map((track) =>
              html`<track-header
                track-id="${track.trackId}"
                active="${track.trackId === view.activeTrackId}"
              ></track-header>`.key(track.trackId),
            )}
          </div>
        </div>
        <timeline-menu
          open="${menu.open}"
          x="${menu.x}"
          y="${menu.y}"
          items="${menu.open ? trackMenu(timeline, menu.trackId) : []}"
          onmenuclose="${handleMenuClose}"
        ></timeline-menu>
      </div>
    `,
    shadow: false,
  },
});
