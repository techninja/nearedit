/**
 * Create tab — what can be made without media: generators (each tile is a
 * live thumbnail drawn by the frame compositor; hover plays it), ready
 * text styles, effects, web clips (a recording of a web page being used),
 * music (a drum machine and a synth) and the elements of the project's
 * brand kit. Pressing a generator or a text style adds it at the edit
 * cursor — backgrounds behind the picture, everything else in front — and
 * selects it; pressing an effect applies it to the selected clips; a web
 * clip is added from its address and opens in the web editor; a beat or a
 * loop is added on an audio track; a brand element lands where its kind
 * belongs, ready for its text. Tiles and effects can also be dragged onto
 * the timeline. The lists come from the catalog and the kit: whatever is
 * registered there shows up.
 * @module components/organisms/create-panel
 */

import { define, html, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import * as on from '#utils/create/panelEvents.js';
import { effectList, generatorTiles, textTiles } from '#utils/create/panelTemplates.js';
import { getSelection } from '#utils/editor/view.js';
import { containTyping } from '#utils/inspector/fieldEvents.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/create-thumb/create-thumb.js';
import '#molecules/brand-create/brand-create.js';
import '#molecules/effect-catalog/effect-catalog.js';
import '#molecules/music-create/music-create.js';
import '#molecules/web-create/web-create.js';

/** @typedef {import('#utils/create/panelEvents.js').CreatePanelHost} CreatePanelHost */

const SECTIONS = [
  { id: 'generators', label: 'Generators', icon: 'shapes' },
  { id: 'text', label: 'Text', icon: 'title' },
  { id: 'effects', label: 'Effects', icon: 'effects' },
  { id: 'web', label: 'Web', icon: 'web' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'brand', label: 'Brand', icon: 'palette' },
];

const HINTS = {
  effects: 'Effects apply to the selected clips',
  web: 'A web clip is added at the edit cursor and opens for its steps',
  music: 'Music is added at the edit cursor, on an audio track',
};

/** What each section shows, as a template of the panel. */
const BODIES = {
  generators: generatorTiles,
  text: textTiles,
  effects: effectList,
  web: () => html`<web-create onweb-add="${on.handleWebAdd}"></web-create>`,
  music: () => html`<music-create onmusic-add="${on.handleMusicAdd}"></music-create>`,
  brand: () => html`<brand-create onbrand-add="${on.handleBrandAdd}"></brand-create>`,
};
const ADD_HINT = 'Click to add at the edit cursor, or drag onto the timeline';

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
          ${(BODIES[host.section] || generatorTiles)(host)}
        </div>
        <div class="create-panel-status" role="status">
          ${host.status || HINTS[host.section] || ADD_HINT}
        </div>
      </div>
    `,
    shadow: false,
  },
});
