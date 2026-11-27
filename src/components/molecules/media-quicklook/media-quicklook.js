/**
 * Quick look — a playable preview of one media file with a scrub bar and
 * in/out marks, so only part of a file can be added to the timeline.
 * Marks live in `#utils/media/ranges.js`; a change is announced with a
 * bubbling `media-marks` event. Keys while focused: I / O mark in and
 * out, Space plays.
 * @module components/molecules/media-quicklook
 */

import { define, dispatch, html } from 'hybrids';
import { NO_ITEM, formatSeconds } from '#utils/media/format.js';
import {
  handleMediaEvent,
  handlePlayPause,
  handleScrub,
  rangeStyle,
} from '#utils/media/previewPlayer.js';
import { markFile } from '#utils/media/ranges.js';
import { mediaFileUrl } from '#utils/playback/mediaUrl.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/media-marks/media-marks.js';

/**
 * @typedef {Object} MediaQuicklookHost
 * @property {import('#utils/media/library.js').MediaItem} item
 * @property {number} time - Preview position, seconds
 * @property {boolean} playing
 * @property {number} revision - Bumped when the marks change
 */

/** @typedef {MediaQuicklookHost & HTMLElement} Host */

const PLAY_ICON = html`<app-icon name="play" size="sm"></app-icon>`;
const PAUSE_ICON = html`<app-icon name="pause" size="sm"></app-icon>`;

/** @param {string} path @returns {string} */
const frameUrl = (path) => `/api/previews/frame?path=${encodeURIComponent(path)}&time=0&height=360`;

/** @param {Host} host @param {'in'|'out'} edge */
function mark(host, edge) {
  markFile(host.item.filePath, edge, host.time, host.item.duration);
  host.revision++;
  dispatch(host, 'media-marks', { detail: { path: host.item.filePath }, bubbles: true });
}

/** @param {Host} host @param {KeyboardEvent} event */
function handleKeydown(host, event) {
  const key = event.key.toLowerCase();
  if (!['i', 'o', ' '].includes(key) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (key === ' ') handlePlayPause(host);
  else mark(host, key === 'i' ? 'in' : 'out');
}

/** @param {Host} host */
function handleMarksChanged(host) {
  host.revision++;
}

/**
 * @param {import('#utils/media/library.js').MediaItem} item
 * @returns {import('hybrids').UpdateFunctionWithMethods<MediaQuicklookHost>}
 */
function stage(item) {
  const src = mediaFileUrl(item.filePath);
  if (item.type === 'video')
    return html`<video
      src="${src}"
      poster="${frameUrl(item.filePath)}"
      preload="metadata"
      playsinline
      onclick="${handlePlayPause}"
    ></video>`;
  if (item.type === 'image')
    return html`<img src="${frameUrl(item.filePath)}" alt="${item.filename}" />`;
  if (item.type !== 'audio') return html`<app-icon name="file-text" size="lg"></app-icon>`;
  return html`<app-icon name="music" size="lg"></app-icon>
    <audio src="${src}" preload="metadata"></audio>`;
}

/** @type {import('hybrids').Component<MediaQuicklookHost>} */
export default define({
  tag: 'media-quicklook',
  item: {
    value: NO_ITEM,
    observe(host) {
      host.time = 0;
      host.playing = false;
    },
  },
  time: 0,
  playing: false,
  revision: 0,
  render: {
    value: ({ item, time, playing, revision }) => {
      if (!item.filePath) return html``;
      const timed = item.type === 'video' || item.type === 'audio';
      return html`
        <div
          class="media-quicklook"
          onkeydown="${handleKeydown}"
          onmedia-marks="${handleMarksChanged}"
        >
          <div
            class="media-quicklook-stage media-quicklook-${item.type}"
            ontimeupdate="${handleMediaEvent}"
            onplay="${handleMediaEvent}"
            onpause="${handleMediaEvent}"
          >
            ${stage(item)}
          </div>
          ${timed &&
          html`<div class="media-quicklook-transport">
            <button
              type="button"
              class="icon-btn"
              aria-label="${playing ? 'Pause preview' : 'Play preview'}"
              title="${playing ? 'Pause (Space)' : 'Play (Space)'}"
              onclick="${handlePlayPause}"
            >
              ${playing ? PAUSE_ICON : PLAY_ICON}
            </button>
            <span
              class="media-quicklook-scrub"
              style="${rangeStyle(item)}"
              data-revision="${revision}"
            >
              <input
                type="range"
                class="field-range"
                aria-label="Preview position"
                min="0"
                max="${item.duration || 0}"
                step="0.01"
                value="${time}"
                oninput="${handleScrub}"
              />
            </span>
            <span class="media-quicklook-time"
              >${formatSeconds(time)} / ${formatSeconds(item.duration)}</span
            >
          </div>`}
          <media-marks item="${item}" time="${time}" revision="${revision}"></media-marks>
        </div>
      `;
    },
    shadow: false,
  },
});
