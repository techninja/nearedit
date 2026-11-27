/**
 * Create tab — what can be made without media: generators (each tile is a
 * live thumbnail drawn by the frame compositor; hover plays it), ready
 * text styles, and effects. Pressing a generator or a text style adds it
 * at the edit cursor — backgrounds behind the picture, everything else in
 * front — and selects it; pressing an effect applies it to the selected
 * clips. Tiles and effects can also be dragged onto the timeline. The
 * lists come from the catalog: whatever is registered there shows up.
 * @module components/organisms/create-panel
 */

import { define, html, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import * as on from '#utils/create/panelEvents.js';
import { effectList, generatorTiles, tile } from '#utils/create/panelTemplates.js';
import { TEXT_PRESETS } from '#utils/create/textPresets.js';
import { getSelection } from '#utils/editor/view.js';
import { containTyping } from '#utils/inspector/fieldEvents.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/create-thumb/create-thumb.js';
import '#molecules/effect-catalog/effect-catalog.js';

/** @typedef {import('#utils/create/panelEvents.js').CreatePanelHost} CreatePanelHost */

const SECTIONS = [
  { id: 'generators', label: 'Generators', icon: 'shapes' },
  { id: 'text', label: 'Text', icon: 'title' },
  { id: 'effects', label: 'Effects', icon: 'effects' },
];

/** Re-read the selection only when it changed (the view changes every playback frame). */
const watchSelection = (
  /** @type {any} */ _host,
  /** @type {string} */ _key,
  /** @type {() => void} */ invalidate,
) =>
  store.observe(ViewState, (_id, view, last) => {
    if ((view?.selection || []).join() !== (last?.selection || []).join()) invalidate();
  });

/** @type {import('hybrids').Component<CreatePanelHost>} */
export default define({
  tag: 'create-panel',
  section: 'generators',
  query: '',
  hovered: '',
  status: '',
  selection: { value: () => getSelection(), connect: watchSelection },
  timeline: store(TimelineState),
  render: {
    value: (host) => html`
      <div class="create-panel panel" onkeydown="${containTyping}">
        <div class="create-panel-sections seg" role="group" aria-label="What to create">
          ${SECTIONS.map(
            ({ id, label, icon }) =>
              html`<button
                type="button"
                data-section="${id}"
                aria-pressed="${host.section === id ? 'true' : 'false'}"
                onclick="${on.handleSection}"
              >
                <app-icon name="${icon}" size="sm"></app-icon> ${label}
              </button>`,
          )}
        </div>
        <div class="panel-body" data-format="${host.timeline.resolution}">
          ${host.section === 'effects'
            ? effectList(host)
            : host.section === 'text'
              ? html`<div class="field-group-title">Text styles</div>
                  <div class="create-panel-grid" role="group" aria-label="Text styles">
                    ${TEXT_PRESETS.map((preset) =>
                      tile('text', { ...preset, key: preset.id }, host.hovered),
                    )}
                  </div>`
              : generatorTiles(host)}
        </div>
        <div class="create-panel-status" role="status">
          ${host.status ||
          (host.section === 'effects'
            ? 'Effects apply to the selected clips'
            : 'Click to add at the edit cursor, or drag onto the timeline')}
        </div>
      </div>
    `,
    shadow: false,
  },
});
