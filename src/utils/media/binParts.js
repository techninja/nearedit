/**
 * Parts of the media bin's template: the windowed rows and the quick-look
 * pane, and the rule for when that pane shows.
 * @module utils/media/binParts
 */

import { html } from 'hybrids';
import { ROW_HEIGHT } from '#utils/media/binList.js';
import { getMediaItem } from '#utils/media/library.js';
import { getMarks } from '#utils/media/ranges.js';
import { rowWindow } from '#utils/media/virtualRows.js';

/** @typedef {import('#utils/media/binEvents.js').MediaBinHost} MediaBinHost */
/** @typedef {import('#utils/media/library.js').MediaItem} MediaItem */

/**
 * The file the quick look is about: the one picked last.
 * @param {MediaBinHost} host
 * @returns {MediaItem|undefined}
 */
export const focusItem = (host) => getMediaItem(host.selected[host.selected.length - 1]);

/**
 * Whether the quick look shows. In a tall bin it sits under the list and
 * is open unless closed. In a short one there is no room for both: it is
 * opened on request and then takes the list's place until closed again.
 * @param {MediaBinHost} host
 * @returns {boolean}
 */
export function lookIsOpen(host) {
  return host.compact ? host.look === 'open' && !!focusItem(host) : host.look !== 'closed';
}

/**
 * The rows in view, positioned inside a spacer as tall as the whole list.
 * @param {MediaBinHost} host
 * @param {MediaItem[]} items
 * @returns {import('hybrids').UpdateFunctionWithMethods<MediaBinHost>}
 */
export function rows(host, items) {
  const view = {
    count: items.length,
    rowHeight: ROW_HEIGHT,
    scrollTop: host.listTop,
    viewportHeight: host.viewHeight,
  };
  const { first, last, offset, height } = rowWindow(view);
  return html`
    <div class="media-bin-sizer" style="${{ height: `${height}px` }}">
      <div class="media-bin-window" style="${{ transform: `translateY(${offset}px)` }}">
        ${items
          .slice(first, last)
          .map((item) =>
            html`<media-row
              item="${item}"
              selected="${host.selected.includes(item.filePath)}"
              status="${host.status}"
              marks="${getMarks(item.filePath)}"
            ></media-row>`.key(item.filePath),
          )}
      </div>
    </div>
  `;
}

/**
 * The quick-look pane: preview with marks, then what is known about the file.
 * @param {MediaBinHost} host
 * @returns {import('hybrids').UpdateFunctionWithMethods<MediaBinHost>}
 */
export function lookPane(host) {
  const focus = focusItem(host);
  return html`<div class="media-bin-look">
    ${focus
      ? html`<media-quicklook item="${focus}"></media-quicklook>
          <media-details
            item="${focus}"
            status="${host.status}"
            busy="${!!host.job.active}"
          ></media-details>`
      : html`<div class="empty-state">
          Select a file to preview it, mark the part to use and see what is known about it.
        </div>`}
  </div>`;
}
