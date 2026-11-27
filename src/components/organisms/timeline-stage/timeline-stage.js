/**
 * Timeline stage — the canvas the tracks and clips are drawn on, with its
 * pointer, wheel, touch and drag-and-drop input, the context menu, the
 * inline marker rename and the "how to start" hint of an empty timeline.
 * Drawing and interaction live in `#utils/timeline/`; this is the shell.
 * @module components/organisms/timeline-stage
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { handleStageEvent } from '#utils/timeline/interaction/events.js';
import { contextMenu } from '#utils/timeline/menuModel.js';
import { connectStage, ensureStage, timelineStage } from '#utils/timeline/stageHost.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/timeline-marker-field/timeline-marker-field.js';
import '#molecules/timeline-menu/timeline-menu.js';

/**
 * @typedef {Object} TimelineStageHost
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline - Summary of the
 *   document, replaced whenever it changes
 * @property {{ open: boolean, x: number, y: number, hit: any }} menu - Context menu state
 * @property {string} renaming - Id of the marker being renamed, or ''
 */

/** @typedef {TimelineStageHost & HTMLElement} Host */

const MENU_CLOSED = { open: false, x: 0, y: 0, hit: null };

/**
 * Every canvas event goes to the stage's interaction code.
 * @param {Host} host
 * @param {Event} event
 */
function handleCanvasEvent(host, event) {
  const stage = timelineStage(host);
  if (stage) handleStageEvent(stage, event);
}

/** @param {Host} host */
function handleMenuClose(host) {
  host.menu = MENU_CLOSED;
}

/** @param {Host} host */
function handleRenameDone(host) {
  host.renaming = '';
}

/**
 * What the interaction code may ask of this component.
 * @param {Host} host
 * @returns {import('#utils/timeline/stage.js').StageUi}
 */
function stageUi(host) {
  return {
    openMenu: (x, y, hit) => {
      host.menu = { open: true, x, y, hit };
    },
    renameMarker: (markerId) => {
      host.renaming = markerId;
    },
  };
}

/** @type {import('hybrids').Component<TimelineStageHost>} */
export default define({
  tag: 'timeline-stage',
  timeline: store(TimelineState),
  menu: { value: MENU_CLOSED },
  renaming: '',
  render: {
    value: (host) => {
      const { timeline, menu, renaming } = host;
      const empty = timeline.clipCount === 0;
      return html`
        <div class="timeline-stage">
          <canvas
            role="img"
            aria-label="Timeline: tracks and clips"
            onpointerdown="${handleCanvasEvent}"
            onpointermove="${handleCanvasEvent}"
            onpointerup="${handleCanvasEvent}"
            onpointercancel="${handleCanvasEvent}"
            onpointerleave="${handleCanvasEvent}"
            onwheel="${handleCanvasEvent}"
            ondblclick="${handleCanvasEvent}"
            oncontextmenu="${handleCanvasEvent}"
            ondragover="${handleCanvasEvent}"
            ondragleave="${handleCanvasEvent}"
            ondrop="${handleCanvasEvent}"
          ></canvas>
          ${empty &&
          html`<div class="empty-state timeline-stage-empty">
            <app-icon name="import" size="lg"></app-icon>
            <strong>Drag media here to start</strong>
            <span
              >Drop a clip on a track to place it, or press <kbd class="kbd">T</kbd> to add a
              title.</span
            >
          </div>`}
          <timeline-marker-field
            marker-id="${renaming}"
            ondone="${handleRenameDone}"
          ></timeline-marker-field>
          <timeline-menu
            open="${menu.open}"
            x="${menu.x}"
            y="${menu.y}"
            items="${menu.open ? contextMenu(menu.hit, stageUi(host)) : []}"
            onmenuclose="${handleMenuClose}"
          ></timeline-menu>
        </div>
      `;
    },
    shadow: false,
    connect: (host) => connectStage(host),
    observe: (host) => ensureStage(host, () => stageUi(host)),
  },
});
