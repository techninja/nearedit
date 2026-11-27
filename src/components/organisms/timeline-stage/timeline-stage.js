/**
 * Timeline stage — the canvas the tracks and clips are drawn on, with its
 * pointer, wheel, touch and drag-and-drop input, the context menu, the
 * inline marker rename and the "how to start" hint of an empty timeline.
 * Drawing and interaction live in `#utils/timeline/`; this is the shell.
 * @module components/organisms/timeline-stage
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import UserPrefs from '#store/UserPrefs.js';
import { onUiRequest } from '#utils/commands/viewCommands.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
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
 * @property {{ markerId: string, regionId: string }} renaming - The marker or region being
 *   named; both '' when none is
 * @property {import('#store/UserPrefs.js').UserPrefsShape} prefs - The hint names a shortcut
 */

/** @typedef {TimelineStageHost & HTMLElement} Host */

const MENU_CLOSED = { open: false, x: 0, y: 0, hit: null };
const NOT_RENAMING = { markerId: '', regionId: '' };

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
  host.renaming = NOT_RENAMING;
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
      host.renaming = { markerId, regionId: '' };
    },
    renameRegion: (regionId) => {
      host.renaming = { markerId: '', regionId };
    },
  };
}

/**
 * Commands ask for a name through the UI: a marker or region just added.
 * @param {Host} host
 * @returns {() => void} Stop listening
 */
function serveRenames(host) {
  return onUiRequest((request, id) => {
    if (request === 'renameMarker') stageUi(host).renameMarker(id);
    if (request === 'renameRegion') stageUi(host).renameRegion(id);
  });
}

/** @type {import('hybrids').Component<TimelineStageHost>} */
export default define({
  tag: 'timeline-stage',
  timeline: store(TimelineState),
  menu: { value: MENU_CLOSED },
  renaming: { value: NOT_RENAMING, connect: serveRenames },
  prefs: store(UserPrefs),
  render: {
    value: (host) => {
      const { timeline, menu, renaming, prefs } = host;
      const empty = timeline.clipCount === 0;
      // Reading the preset keeps the hint's shortcut current.
      const titleKey = prefs.keymapPreset && shortcutLabel('title.add');
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
              >Drop a clip on a track to place
              it${titleKey &&
              html`, or press <kbd class="kbd">${titleKey}</kbd> to add a title`}.</span
            >
          </div>`}
          <timeline-marker-field
            marker-id="${renaming.markerId}"
            region-id="${renaming.regionId}"
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
