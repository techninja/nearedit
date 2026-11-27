/**
 * Footer of the media bin's list: how many files are listed and selected,
 * "add to timeline" for the selection and the quick-look toggle. Reports
 * with bubbling events: `media-add-selected` and `media-toggle-look`.
 * @module components/molecules/media-footer
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaFooterHost
 * @property {number} listed - Files shown by the current search and filter
 * @property {number} total - Files in the project
 * @property {number} selected
 * @property {boolean} look - The quick look is open
 */

/** @param {MediaFooterHost & HTMLElement} host */
function handleAdd(host) {
  dispatch(host, 'media-add-selected', { bubbles: true });
}

/** @param {MediaFooterHost & HTMLElement} host */
function handleToggle(host) {
  dispatch(host, 'media-toggle-look', { bubbles: true });
}

/** @type {import('hybrids').Component<MediaFooterHost>} */
export default define({
  tag: 'media-footer',
  listed: 0,
  total: 0,
  selected: 0,
  look: false,
  render: {
    value: ({ listed, total, selected, look }) => html`
      <span class="media-footer-count" aria-live="polite"
        >${listed === total ? `${total} files` : `${listed} of ${total} files`}${selected > 1
          ? ` · ${selected} selected`
          : ''}</span
      >
      <button
        type="button"
        class="icon-btn media-footer-add"
        disabled="${selected === 0}"
        title="Add the selected files to the timeline at the cursor, in the order picked (Enter)"
        onclick="${handleAdd}"
      >
        <app-icon name="plus" size="sm"></app-icon> Add${selected > 1 ? ` ${selected}` : ''}
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-pressed="${look ? 'true' : 'false'}"
        title="Show or hide the quick look"
        aria-label="Quick look"
        onclick="${handleToggle}"
      >
        <app-icon name="visible" size="sm"></app-icon>
      </button>
    `,
    shadow: false,
  },
});
