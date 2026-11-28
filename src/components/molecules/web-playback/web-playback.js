/**
 * Playback of a web clip's recording inside the web editor — a plain
 * `<video>` of the recorded file with a play button, so a step can be
 * checked without leaving the dialog. The score strip is its scrubber:
 * the owner passes `seek` (`{ time, n }`, a new `n` for every jump) and
 * hears bubbling `web-time` events (`{ time, playing }`) as it plays.
 * @module components/molecules/web-playback
 */

import { define, dispatch, html } from 'hybrids';
import { clockLabel } from '#utils/webUi/stepRows.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} WebPlaybackHost
 * @property {string} src - URL of the recording
 * @property {{ time: number, n: number }} seek - Where to jump to
 * @property {boolean} stale - The recording shows an earlier version of the steps
 * @property {number} time - Where it is, seconds
 * @property {number} length - Its length, seconds
 * @property {boolean} playing
 */

/** @typedef {WebPlaybackHost & HTMLElement} Host */

/** @type {(host: Host) => HTMLVideoElement|null} */
const videoOf = (host) => host.querySelector('video');

/** @param {Host} host */
function report(host) {
  const video = videoOf(host);
  if (!video) return;
  host.time = video.currentTime;
  host.length = Number.isFinite(video.duration) ? video.duration : 0;
  host.playing = !video.paused && !video.ended;
  const detail = { time: host.time, playing: host.playing };
  dispatch(host, 'web-time', { detail, bubbles: true });
}

/** While it plays, the time is reported every frame so a playhead moves smoothly. @param {Host} host */
function follow(host) {
  report(host);
  if (host.playing && host.isConnected) requestAnimationFrame(() => follow(host));
}

/** @param {Host} host */
function handleToggle(host) {
  const video = videoOf(host);
  if (!video) return;
  if (video.ended) video.currentTime = 0;
  if (video.paused) video.play().catch((err) => console.warn('[web] playback:', err.message));
  else video.pause();
}

/** @param {Host} host @param {{ time: number }} seek */
function jump(host, seek) {
  const video = videoOf(host);
  if (video && Number.isFinite(seek?.time)) video.currentTime = Math.max(0, seek.time);
}

/** @type {import('hybrids').Component<WebPlaybackHost>} */
export default define({
  tag: 'web-playback',
  src: '',
  seek: { value: { time: 0, n: 0 }, observe: jump },
  stale: false,
  time: 0,
  length: 0,
  playing: false,
  render: {
    value: ({ src, stale, time, length, playing }) => html`
      <div class="web-playback-stage">
        <video
          src="${src}"
          muted
          playsinline
          preload="auto"
          aria-label="The recording"
          onclick="${handleToggle}"
          onplay="${follow}"
          onpause="${report}"
          onended="${report}"
          onseeked="${report}"
          onloadedmetadata="${report}"
        ></video>
      </div>
      <div class="web-playback-bar">
        <button
          type="button"
          class="icon-btn"
          aria-label="${playing ? 'Pause' : 'Play the recording'}"
          title="${playing ? 'Pause' : 'Play the recording'}"
          onclick="${handleToggle}"
        >
          <app-icon name="${playing ? 'pause' : 'play'}" size="sm"></app-icon>
        </button>
        <span class="web-playback-time">${clockLabel(time)} / ${clockLabel(length)}</span>
        ${stale
          ? html`<span class="badge badge-warning"
              >An earlier recording: the steps changed since</span
            >`
          : html``}
      </div>
    `,
    shadow: false,
  },
});
