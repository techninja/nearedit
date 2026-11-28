/**
 * Brand section of the Create tab — the project's brand kit at a glance
 * (its name, its colours, a button to choose another or shape it), a notice
 * when element clips on the timeline are out of date with it, and its
 * elements as tiles: overlays, segments, transitions. Each tile is the
 * element itself, drawn by the compositor with sample text and framed
 * closer on what it shows. Pressing a tile asks to add it with a bubbling
 * `brand-add` event (`detail: { element }`); a tile can also be dragged
 * onto the timeline.
 * @module components/molecules/brand-create
 */

import { define, html, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { endDrag } from '#utils/create/dragTypes.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import * as on from '#utils/brandUi/createEvents.js';
import { kitNote, kitSwatches, staleNotice } from '#utils/brandUi/createParts.js';
import { elementGroups } from '#utils/brandUi/elementList.js';
import { elementThumb } from '#utils/brandUi/elementThumb.js';
import { kitState } from '#utils/brandUi/kitState.js';
import { staleInfo } from '#utils/brandUi/stale.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/create-thumb/create-thumb.js';

/** @typedef {import('#utils/brandUi/createEvents.js').BrandCreateHost} BrandCreateHost */

/**
 * One element as a tile: its picture and its name.
 * @param {import('#utils/brandUi/elementList.js').ElementItem} item
 * @param {BrandCreateHost} host
 */
const tile = (item, { kit, timeline, hovered }) =>
  html`<button
    type="button"
    class="create-panel-tile"
    data-element="${item.id}"
    data-label="${item.label}"
    title="${`Add ${item.description}`}"
    draggable="true"
    onclick="${on.handleAdd}"
    onpointerenter="${on.handleHover}"
    onpointerleave="${on.handleLeave}"
    onfocus="${on.handleHover}"
    onblur="${on.handleLeave}"
    ondragstart="${on.handleDragStart}"
    ondragend="${endDrag}"
  >
    <create-thumb
      spec="${elementThumb(kit.effective, item.id, timeline)}"
      playing="${hovered === item.id}"
    ></create-thumb>
    <span class="create-panel-name">${item.label}</span>
  </button>`.key(item.id);

/** @type {import('hybrids').Component<BrandCreateHost>} */
export default define({
  tag: 'brand-create',
  kit: watch(kitState),
  doc: liveDoc(),
  timeline: store(TimelineState),
  hovered: '',
  said: '',
  render: {
    value: (host) => {
      const { kit, doc, said } = host;
      const groups = elementGroups(kit.effective);
      return html`
        <div class="brand-create-kit">
          ${kitSwatches(kit.effective)}
          <span class="brand-create-name">
            <strong title="${kit.effective.name}">${kit.effective.name}</strong>
            <small>${kitNote(kit)}</small>
          </span>
          <button
            type="button"
            class="btn btn-secondary brand-create-open"
            title="Choose another kit, or set the colours, fonts and logo"
            onclick="${on.handleOpen}"
          >
            <app-icon name="palette" size="sm"></app-icon> Brand…
          </button>
        </div>
        ${staleNotice(staleInfo(doc, kit.effective), on.handleUpdate, said)}
        ${groups.map(
          (group) => html`
            <div class="field-group-title">${group.label}</div>
            <div
              class="create-panel-grid brand-create-grid"
              role="group"
              aria-label="${group.label}"
            >
              ${group.items.map((item) => tile(item, host))}
            </div>
          `,
        )}
        ${groups.length ? html`` : html`<div class="empty-state">This kit has no elements.</div>`}
      `;
    },
    shadow: false,
  },
});
