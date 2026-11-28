/**
 * Page map of the web editor — the page as it stands before the selected
 * step, drawn whole: the snapshot's picture sits where the viewport is,
 * and everything one can aim at (links, buttons, form controls, headings,
 * sections) is an outline that lights up under the pointer and can be
 * pressed. What lies above or below the picture has no picture: there the
 * outlines carry the names. The element scrolls. By keyboard the map is one
 * Tab stop and the arrow keys walk the outlines. A press sends a bubbling
 * `web-pick` event (`detail: { pick: { element, point }, x, y }`).
 * @module components/molecules/web-page-map
 */

import { define, html } from 'hybrids';
import * as on from '#utils/webUi/pageEvents.js';
import { mapLayout, markOf, percentBox, placeOf, stackedElements } from '#utils/webUi/pageMap.js';

/**
 * @typedef {Object} WebPageMapHost
 * @property {import('#utils/webUi/pageMap.js').Snapshot|null} snapshot
 * @property {string} mark - The target of the selected step as text
 *   (`describeTarget`), marked on the map
 * @property {boolean} picking - The next press fills in a target
 * @property {boolean} busy - A newer snapshot is on its way
 */

/**
 * One element's outline.
 * @param {import('#utils/webUi/pageMap.js').Snapshot} snapshot
 * @param {import('#utils/webUi/pageMap.js').PageElement & { index: number }} element
 * @param {{ width: number, height: number }} layout
 * @param {number} marked - Index of the marked element
 * @param {number} stop - Index of the outline the Tab key stops at
 */
function outline(snapshot, element, layout, marked, stop) {
  // Inside the picture's bounds but cut off by a panel around it: not in the picture either.
  const out = placeOf(snapshot, element.rect) !== 'view' || element.visible === false;
  const label = `${element.kind}: ${element.name}`;
  return html`<button
    type="button"
    class="${{
      'web-page-map-el': true,
      'is-out': out,
      'is-section': element.kind === 'section',
      'is-marked': element.index === marked,
    }}"
    data-index="${element.index}"
    data-label="${label}"
    aria-label="${label}"
    tabindex="${element.index === stop ? 0 : -1}"
    style="${percentBox(element.rect, layout)}"
    onclick="${on.handleElement}"
    onkeydown="${on.handleOutlineKeys}"
  >
    ${out && element.kind !== 'section' ? html`<span>${element.name}</span>` : html``}
  </button>`.key(`${element.index}:${element.target}`);
}

/** @type {import('hybrids').Component<WebPageMapHost>} */
export default define({
  tag: 'web-page-map',
  snapshot: { value: /** @type {any} */ (null), observe: on.showPicture },
  mark: '',
  picking: { value: false, reflect: true },
  busy: { value: false, reflect: true },
  render: {
    value: ({ snapshot, mark }) => {
      if (!snapshot)
        return html`<div class="empty-state">The picture of the page shows here.</div>`;
      const layout = mapLayout(snapshot);
      const { view } = layout;
      const marked = markOf(snapshot, mark);
      const below = { x: 0, y: view.y + view.height, width: layout.width, height: 0 };
      below.height = layout.height - below.y;
      return html`<div
        class="web-page-map-area"
        style="${{
          aspectRatio: `${layout.width} / ${layout.height}`,
          '--web-page-ratio': String(view.width / view.height),
          '--web-page-width': `${view.width}px`,
        }}"
        onclick="${on.handleMap}"
      >
        <img
          class="web-page-map-shot"
          alt="${`The page: ${snapshot.title || snapshot.url}`}"
          src="${snapshot.image}"
          style="${percentBox(view, layout)}"
          draggable="false"
        />
        ${below.height > 1 &&
        html`<div class="web-page-map-fold" style="${percentBox(below, layout)}">
          <span>Below the picture: the rest of the page, as outlines</span>
        </div>`}
        ${stackedElements(snapshot).map((element) =>
          outline(snapshot, element, layout, marked.index, Math.max(0, marked.index)),
        )}
        ${marked.point &&
        html`<span
          class="web-page-map-point"
          style="${percentBox({ ...marked.point, width: 0, height: 0 }, layout)}"
        ></span>`}
      </div>`;
    },
    shadow: false,
  },
});
