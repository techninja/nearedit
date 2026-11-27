/**
 * Media bin toolbar: search, type filter with counts, sort order and
 * refresh. Holds no state — it reports what the user chose with bubbling
 * events: `media-filter` (`{ query?, type?, sort? }`) and `media-refresh`.
 * @module components/molecules/media-toolbar
 */

import { define, dispatch, html } from 'hybrids';
import { MEDIA_TYPES, SORT_KEYS } from '#utils/media/filter.js';
import { TYPE_ICONS } from '#utils/media/format.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaToolbarHost
 * @property {string} query
 * @property {string} type - `all` or a media type
 * @property {string} sort - One of `SORT_KEYS`
 * @property {Record<string, number>} counts - Items per type, and `all`
 * @property {boolean} loading - The library is being (re)loaded
 */

/** @typedef {MediaToolbarHost & HTMLElement} Host */

const TYPE_NAMES = { all: 'All', video: 'Video', audio: 'Audio', image: 'Images', text: 'Text' };

/**
 * @param {Host} host
 * @param {Record<string, string>} detail
 */
function emitFilter(host, detail) {
  dispatch(host, 'media-filter', { detail, bubbles: true });
}

/** @param {Host} host @param {Event} event */
function handleQuery(host, event) {
  emitFilter(host, { query: /** @type {HTMLInputElement} */ (event.target).value });
}

/** @param {Host} host @param {Event} event */
function handleType(host, event) {
  emitFilter(host, { type: /** @type {HTMLElement} */ (event.currentTarget).dataset.type });
}

/** @param {Host} host @param {Event} event */
function handleSort(host, event) {
  emitFilter(host, { sort: /** @type {HTMLSelectElement} */ (event.target).value });
}

/** @param {Host} host */
function handleRefresh(host) {
  dispatch(host, 'media-refresh', { bubbles: true });
}

/** @param {Host} _host @param {KeyboardEvent} event */
function keepKeysLocal(_host, event) {
  event.stopPropagation(); // typing a search must not trigger editor shortcuts
}

/** @type {import('hybrids').Component<MediaToolbarHost>} */
export default define({
  tag: 'media-toolbar',
  query: '',
  type: 'all',
  sort: 'name',
  counts: { value: {} },
  loading: false,
  render: {
    value: ({ query, type, sort, counts, loading }) => html`
      <div class="media-toolbar-row">
        <label class="media-toolbar-search">
          <app-icon name="search" size="sm"></app-icon>
          <input
            type="search"
            class="field-input"
            placeholder="Search names and tags"
            aria-label="Search media"
            value="${query}"
            oninput="${handleQuery}"
            onkeydown="${keepKeysLocal}"
          />
        </label>
        <select
          class="field-input media-toolbar-sort"
          aria-label="Sort by"
          onchange="${handleSort}"
        >
          ${SORT_KEYS.map(
            ({ key, label }) =>
              html`<option value="${key}" selected="${key === sort}">${label}</option>`,
          )}
        </select>
        <button
          type="button"
          class="icon-btn"
          title="Reload the media list"
          aria-label="Reload the media list"
          disabled="${loading}"
          onclick="${handleRefresh}"
        >
          <app-icon name="refresh" size="sm"></app-icon>
        </button>
      </div>
      <div class="media-toolbar-types seg" role="group" aria-label="Filter by type">
        ${['all', ...MEDIA_TYPES].map(
          (name) => html`
            <button
              type="button"
              data-type="${name}"
              aria-pressed="${name === type ? 'true' : 'false'}"
              title="${TYPE_NAMES[name]}"
              aria-label="${TYPE_NAMES[name]}: ${counts[name] || 0}"
              onclick="${handleType}"
            >
              ${name === 'all'
                ? 'All'
                : html`<app-icon name="${TYPE_ICONS[name]}" size="sm"></app-icon>`}
              <span class="media-toolbar-count">${counts[name] || 0}</span>
            </button>
          `,
        )}
      </div>
    `,
    shadow: false,
  },
});
