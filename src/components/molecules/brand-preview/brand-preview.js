/**
 * Live preview of a brand kit — several of its elements, each drawn by the
 * compositor with sample text over a sample picture, in the shape of the
 * open timeline. It redraws when the kit changes, so a colour or a font
 * shows the moment it is set; pointing at a picture (or focusing it) plays
 * the element's motion.
 * @module components/molecules/brand-preview
 */

import { define, html } from 'hybrids';
import { formatOf } from '#utils/brand/index.js';
import { parseResolution } from '#utils/edl/factory.js';
import { elementItems } from '#utils/brandUi/elementList.js';
import { elementThumb } from '#utils/brandUi/elementThumb.js';
import '#atoms/brand-frame/brand-frame.js';

/**
 * @typedef {Object} BrandPreviewHost
 * @property {import('#utils/brand/types.js').Kit} kit - An effective kit
 * @property {{ resolution?: string, fps?: number }} like - The open document's shape
 * @property {string} hovered - The element whose motion plays
 */

/** The elements shown, in this order, when the kit has them. */
export const PREVIEW_ELEMENTS = ['lower-third', 'title', 'quote', 'intro', 'outro', 'bug'];
/** Elements shown at most. */
const MOST = 6;

/**
 * @param {import('#utils/brand/types.js').Kit} kit
 * @returns {import('#utils/brandUi/elementList.js').ElementItem[]} The
 *   elements the preview shows: the usual ones first, then whatever else
 *   the kit has, up to six
 */
export function previewItems(kit) {
  const items = elementItems(kit);
  const rank = (/** @type {string} */ id) => (PREVIEW_ELEMENTS.indexOf(id) + 1 || MOST + 1) - 1;
  return [...items].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, MOST);
}

/** @param {BrandPreviewHost & HTMLElement} host @param {Event} event */
function handleHover(host, event) {
  host.hovered = /** @type {HTMLElement} */ (event.currentTarget).dataset.element;
}

/** @param {BrandPreviewHost & HTMLElement} host */
function handleLeave(host) {
  host.hovered = '';
}

/** @type {import('hybrids').Component<BrandPreviewHost>} */
export default define({
  tag: 'brand-preview',
  kit: { value: /** @type {any} */ ({}) },
  like: { value: /** @type {any} */ ({}) },
  hovered: '',
  render: {
    value: ({ kit, like, hovered }) => html`
      <ul
        class="brand-preview-list"
        aria-label="How the brand looks"
        data-format="${formatOf(parseResolution(like?.resolution))}"
      >
        ${(kit?.elements ? previewItems(kit) : []).map((item) =>
          html`<li
            data-element="${item.id}"
            tabindex="0"
            title="${`${item.label} — point here to see it move`}"
            onpointerenter="${handleHover}"
            onpointerleave="${handleLeave}"
            onfocus="${handleHover}"
            onblur="${handleLeave}"
          >
            <brand-frame
              spec="${elementThumb(kit, item.id, like)}"
              playing="${hovered === item.id}"
            ></brand-frame>
            <span>${item.label}</span>
          </li>`.key(item.id),
        )}
      </ul>
    `,
    shadow: false,
  },
});
