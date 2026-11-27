/**
 * Media bin — the project's media, fast to scan and act on: search,
 * filter and sort; analysis badges with one-click analysis; add to the
 * timeline by drag, double-click, Enter or the add button; and a quick
 * look with in/out marks (under the list in a tall bin, in its place — on
 * request — in a short one). The list renders only the rows in view.
 * @module components/organisms/media-bin
 */

import { define, html } from 'hybrids';
import * as on from '#utils/media/binEvents.js';
import { emptyMessage, handleListKeydown, handlePick, listedItems } from '#utils/media/binList.js';
import { typeCounts } from '#utils/media/filter.js';
import { lookIsOpen, lookPane, rows } from '#utils/media/binParts.js';
import { getLibrary, libraryStatus } from '#utils/media/library.js';
import '#molecules/media-details/media-details.js';
import '#molecules/media-footer/media-footer.js';
import '#molecules/media-quicklook/media-quicklook.js';
import '#molecules/media-row/media-row.js';
import '#molecules/media-status/media-status.js';
import '#molecules/media-toolbar/media-toolbar.js';

/** @typedef {import('#utils/media/binEvents.js').MediaBinHost} MediaBinHost */

/** @type {import('hybrids').Component<MediaBinHost>} */
export default define({
  tag: 'media-bin',
  // `revision` changes whenever the library (or a file's marks) did.
  library: ({ revision }) => (revision >= 0 ? getLibrary() : []),
  revision: { value: 0, connect: on.connectBin },
  query: '',
  type: 'all',
  sort: 'name',
  selected: { value: [] },
  anchor: '',
  listTop: 0,
  viewHeight: 0,
  job: { value: {} },
  notice: { value: {} },
  status: { value: {} },
  look: 'auto',
  compact: false,
  render: {
    value: (host) => {
      const { library, selected, job, notice } = host;
      const items = listedItems(host);
      const open = lookIsOpen(host);
      return html`
        <div
          class="${{ 'media-bin': true, panel: true, 'media-bin-compact': host.compact && open }}"
          onmedia-filter="${on.handleFilter}"
          onmedia-refresh="${on.handleRefresh}"
          onmedia-pick="${handlePick}"
          onmedia-add="${on.handleAdd}"
          onmedia-analyze="${on.handleAnalyze}"
          onmedia-cancel="${on.handleCancel}"
          onmedia-dismiss="${on.handleDismiss}"
          onmedia-marks="${on.handleMarks}"
          onmedia-transcript="${on.handleTranscript}"
          onmedia-add-selected="${on.handleAddSelected}"
          onmedia-toggle-look="${on.handleToggleLook}"
        >
          <media-toolbar
            query="${host.query}"
            type="${host.type}"
            sort="${host.sort}"
            counts="${typeCounts(library)}"
            loading="${libraryStatus().loading}"
          ></media-toolbar>
          <div
            class="media-bin-list"
            role="listbox"
            tabindex="0"
            aria-label="Media files"
            aria-multiselectable="true"
            onscroll="${on.handleScroll}"
            onkeydown="${handleListKeydown}"
          >
            ${items.length
              ? rows(host, items)
              : html`<div class="empty-state">${emptyMessage(host)}</div>`}
          </div>
          <media-footer
            listed="${items.length}"
            total="${library.length}"
            selected="${selected.length}"
            look="${open}"
            lookable="${!host.compact || selected.length > 0}"
          ></media-footer>
          <media-status
            job="${job}"
            notice="${notice}"
            selected="${selected.length}"
            total="${library.length}"
          ></media-status>
          ${open && lookPane(host)}
        </div>
      `;
    },
    shadow: false,
  },
});
