/**
 * Timeline panel — the Vegas-style timeline: toolbar on top, track headers
 * on the left, the canvas of lanes and clips, and scrollbars. Takes no
 * attributes: it reads the open document and view state, fills whatever
 * box its parent gives it, and shows an empty timeline before a project
 * has loaded.
 * @module components/organisms/timeline-panel
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { onUiRequest } from '#utils/commands/viewCommands.js';
import { getStageSize, onStageSize } from '#utils/timeline/metrics.js';
import { scrollExtent, scrollTo } from '#utils/timeline/scroll.js';
import '#atoms/timeline-scrollbar/timeline-scrollbar.js';
import '#molecules/timeline-shortcuts/timeline-shortcuts.js';
import '#molecules/timeline-toolbar/timeline-toolbar.js';
import '#organisms/timeline-stage/timeline-stage.js';
import '#organisms/track-list/track-list.js';

/**
 * @typedef {Object} TimelinePanelHost
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline - Summary of the
 *   document, replaced whenever it changes
 * @property {import('#store/ViewState.js').ViewStateShape} view
 * @property {import('#utils/timeline/metrics.js').StageSize} size - Size of the canvas
 * @property {boolean} shortcutsOpen
 */

/** @typedef {TimelinePanelHost & HTMLElement} Host */

/**
 * @param {Host} _host
 * @param {CustomEvent<number>} event
 */
const handleScrollX = (_host, event) => scrollTo({ x: event.detail });

/**
 * @param {Host} _host
 * @param {CustomEvent<number>} event
 */
const handleScrollY = (_host, event) => scrollTo({ y: event.detail });

/** @param {Host} host */
function handleShortcutsClose(host) {
  host.shortcutsOpen = false;
}

/** @type {import('hybrids').Component<TimelinePanelHost>} */
export default define({
  tag: 'timeline-panel',
  timeline: store(TimelineState),
  view: store(ViewState),
  size: {
    value: getStageSize(),
    connect: (host) =>
      onStageSize((size) => {
        host.size = size;
      }),
  },
  shortcutsOpen: {
    value: false,
    connect: (host) =>
      onUiRequest((request) => {
        if (request === 'shortcuts') host.shortcutsOpen = true;
      }),
  },
  render: {
    // `timeline` and `size` are read so the scrollbars follow the document
    // (`scrollExtent` measures the session's) and the canvas size; the lane
    // height reaches the headers through CSS.
    value: ({ timeline, view, size, shortcutsOpen }) => {
      const extent = scrollExtent(view.zoom);
      return html`
        <section class="panel timeline-panel" aria-label="Timeline">
          <timeline-toolbar></timeline-toolbar>
          <div
            class="timeline-panel-body"
            style="${{ '--timeline-lane-h': `${size.laneHeight}px` }}"
            data-tracks="${timeline.trackCount}"
          >
            <track-list></track-list>
            <timeline-stage></timeline-stage>
            <timeline-scrollbar
              class="timeline-panel-vscroll"
              axis="y"
              value="${view.scrollY}"
              page="${extent.viewHeight}"
              total="${extent.height}"
              onscrollto="${handleScrollY}"
            ></timeline-scrollbar>
            <timeline-scrollbar
              class="timeline-panel-hscroll"
              axis="x"
              value="${view.scrollX}"
              page="${extent.viewWidth}"
              total="${extent.width}"
              onscrollto="${handleScrollX}"
            ></timeline-scrollbar>
          </div>
          <timeline-shortcuts
            open="${shortcutsOpen}"
            onclose="${handleShortcutsClose}"
          ></timeline-shortcuts>
        </section>
      `;
    },
    shadow: false,
  },
});
