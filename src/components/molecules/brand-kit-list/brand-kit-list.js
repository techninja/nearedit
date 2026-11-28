/**
 * Kit list — the kits a project can take its brand from, as cards: a live
 * picture of each kit's lower third, its name, what it is like, its
 * colours. The kit in use is marked. Pressing a card asks to choose it
 * with a bubbling `kit-choose` event (`detail: { id }`); a kit of the
 * library also has a button that asks to remove it (`kit-remove`,
 * `detail: { id, name }`).
 * @module components/molecules/brand-kit-list
 */

import { define, html } from 'hybrids';
import { kitSwatches } from '#utils/brandUi/createParts.js';
import { elementThumb } from '#utils/brandUi/elementThumb.js';
import { kitPictures, pictureKit } from '#utils/brandUi/kitList.js';
import * as on from '#utils/brandUi/kitListEvents.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/brand-frame/brand-frame.js';

/** @typedef {import('#utils/brandUi/kitListEvents.js').BrandKitListHost} BrandKitListHost */

/** The element a kit is shown by. */
const SHOWN = 'lower-third';
const SOURCES = { builtin: 'Built-in', library: 'Your library', project: 'This project' };

/**
 * @param {BrandKitListHost} host
 * @param {import('#utils/brandUi/kitApi.js').KitEntry & { source: string }} entry
 * @param {import('#utils/brand/types.js').Kit|null} kit - Complete, for the picture
 */
function card(host, entry, kit) {
  const inUse = entry.id === host.current;
  const shown = kit?.elements && (SHOWN in kit.elements ? SHOWN : Object.keys(kit.elements)[0]);
  return html`<li class="brand-kit-list-item">
    <button
      type="button"
      class="brand-kit-card"
      data-id="${entry.id}"
      aria-pressed="${inUse ? 'true' : 'false'}"
      disabled="${host.busy}"
      title="${inUse ? `${entry.name} is this project’s brand` : `Use ${entry.name}`}"
      onclick="${on.handleChoose}"
      onpointerenter="${on.handleHover}"
      onpointerleave="${on.handleLeave}"
      onfocus="${on.handleHover}"
      onblur="${on.handleLeave}"
    >
      ${shown
        ? html`<brand-frame
            class="brand-frame-boxed"
            spec="${elementThumb(kit, shown, host.like, { aspect: 16 / 9 })}"
            playing="${host.hovered === entry.id}"
            size="${384}"
          ></brand-frame>`
        : html`<span class="brand-kit-card-blank">${kitSwatches(entry.colors)}</span>`}
      <span class="brand-kit-card-head">
        <strong>${entry.name}</strong>
        ${inUse ? html`<span class="chip brand-kit-card-inuse">In use</span>` : html``}
      </span>
      <span class="brand-kit-card-about">${entry.description || SOURCES[entry.source]}</span>
      <span class="brand-kit-card-foot">
        ${kitSwatches(entry.colors)} <small>${SOURCES[entry.source] || ''}</small>
        ${entry.problems
          ? html`<small class="brand-kit-card-problems">${entry.problems} to look at</small>`
          : html``}
      </span>
    </button>
    ${entry.source === 'library'
      ? html`<button
          type="button"
          class="icon-btn brand-kit-card-remove"
          data-id="${entry.id}"
          data-name="${entry.name}"
          title="Remove from the library"
          aria-label="${`Remove ${entry.name} from the library`}"
          disabled="${host.busy}"
          onclick="${on.handleRemove}"
        >
          <app-icon name="trash" size="sm"></app-icon>
        </button>`
      : html``}
  </li>`.key(entry.id);
}

/** @type {import('hybrids').Component<BrandKitListHost>} */
export default define({
  tag: 'brand-kit-list',
  kits: { value: [] },
  current: '',
  own: { value: /** @type {any} */ (null) },
  like: { value: /** @type {any} */ ({}) },
  busy: false,
  hovered: '',
  pictures: watch(kitPictures),
  render: {
    value: (host) => {
      const { own } = host;
      const mine = own && {
        ...{ id: 'project', name: own.name || 'This project’s own', source: 'project' },
        ...{ description: 'Customised for this project', colors: own.colors, problems: 0 },
      };
      // Reading the pictures here redraws the list when a library kit's has arrived.
      const seen = host.pictures.byKit;
      return html`<ul class="brand-kit-list" aria-label="Brand kits">
        ${mine ? card(host, /** @type {any} */ (mine), own.kit) : html``}
        ${host.kits.map((entry) => card(host, entry, pictureKit(entry, seen)))}
      </ul>`;
    },
    shadow: false,
  },
});
