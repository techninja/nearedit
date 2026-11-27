/**
 * One file in the media bin: thumbnail, name, key facts, analysis badges
 * and an add button. Dragging it carries the media item to the timeline.
 * Reports clicks as bubbling `media-pick` (`{ path, toggle, range }`) and
 * add requests (button, double-click) as `media-add` (`{ path }`).
 * @module components/molecules/media-row
 */

import { define, dispatch, html } from 'hybrids';
import { analysisBadges } from '#utils/media/analysis.js';
import { NO_ITEM, TYPE_ICONS, formatSeconds, metaParts } from '#utils/media/format.js';
import { MEDIA_DRAG_TYPE } from '#utils/media/library.js';
import { markedRange } from '#utils/media/ranges.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaRowHost
 * @property {import('#utils/media/library.js').MediaItem} item
 * @property {boolean} selected
 * @property {Record<string, any>} status - GET /intelligence/status ({} while unknown)
 * @property {import('#utils/media/ranges.js').SourceMarks} marks - In/out marks of this file
 */

/** @typedef {MediaRowHost & HTMLElement} Host */

/**
 * @param {string} path
 * @returns {string} Small poster frame of a video or still
 */
const thumbUrl = (path) =>
  `/api/previews/thumbnail?path=${encodeURIComponent(path)}&cols=1&height=64`;

/** @param {Host} host @param {MouseEvent} event */
function handleClick(host, event) {
  const detail = {
    path: host.item.filePath,
    toggle: event.ctrlKey || event.metaKey,
    range: event.shiftKey,
  };
  dispatch(host, 'media-pick', { detail, bubbles: true });
}

/** @param {Host} host @param {Event} event */
function handleAdd(host, event) {
  event.stopPropagation();
  dispatch(host, 'media-add', { detail: { path: host.item.filePath }, bubbles: true });
}

/** @param {Host} host @param {DragEvent} event */
function handleDragStart(host, event) {
  if (host.item.type === 'text') return event.preventDefault();
  const range = markedRange(host.marks, host.item.duration);
  event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify({ ...host.item, ...range }));
  event.dataTransfer.setData('text/plain', host.item.filename);
  event.dataTransfer.effectAllowed = 'copy';
}

/** @param {Host} _host @param {Event} event */
function hideBroken(_host, event) {
  /** @type {HTMLElement} */ (event.target).hidden = true;
}

/**
 * @param {MediaRowHost} host
 * @returns {import('hybrids').UpdateFunctionWithMethods<MediaRowHost>}
 */
function picture({ item }) {
  const pictured = item.type === 'video' || item.type === 'image';
  return html`
    <span class="media-row-thumb">
      <app-icon name="${TYPE_ICONS[item.type] || 'film'}" size="sm"></app-icon>
      ${pictured &&
      html`<img
        src="${thumbUrl(item.filePath)}"
        alt=""
        loading="lazy"
        draggable="false"
        onerror="${hideBroken}"
      />`}
    </span>
  `;
}

/** @type {import('hybrids').Component<MediaRowHost>} */
export default define({
  tag: 'media-row',
  item: { value: NO_ITEM },
  selected: false,
  status: { value: {} },
  marks: { value: { in: null, out: null } },
  render: {
    value: (host) => {
      const { item, selected, status, marks } = host;
      if (!item.filePath) return html``;
      const range = markedRange(marks, item.duration);
      const known = Object.keys(status).length ? status : null;
      return html`
        <div
          class="${{ 'media-row': true, 'media-row-selected': selected }}"
          role="option"
          aria-selected="${selected ? 'true' : 'false'}"
          draggable="${item.type !== 'text'}"
          title="${item.relativePath || item.filename}"
          onclick="${handleClick}"
          ondblclick="${handleAdd}"
          ondragstart="${handleDragStart}"
        >
          ${picture(host)}
          <span class="media-row-text">
            <span class="media-row-name">${item.filename}</span>
            <span class="media-row-meta">
              ${metaParts(item).join(' · ')}
              ${range &&
              html`<span class="chip media-row-range" title="Only the marked part is added"
                >part
                ${formatSeconds((range.sourceOut ?? item.duration ?? 0) - range.sourceIn)}</span
              >`}
            </span>
          </span>
          <span class="media-row-badges">
            ${analysisBadges(item, known).map(
              (badge) => html`
                <span class="media-row-badge media-row-badge-${badge.state}" title="${badge.title}">
                  <app-icon name="${badge.icon}" size="sm"></app-icon>
                </span>
              `,
            )}
          </span>
          ${item.type !== 'text' &&
          html`<button
            type="button"
            class="icon-btn media-row-add"
            tabindex="-1"
            title="Add to the timeline at the cursor"
            aria-label="Add ${item.filename} to the timeline"
            onclick="${handleAdd}"
          >
            <app-icon name="plus" size="sm"></app-icon>
          </button>`}
        </div>
      `;
    },
    shadow: false,
  },
});
