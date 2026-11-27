/**
 * The quick look's preview player: play/pause inside the marked range,
 * following the media element, scrubbing, and placing the marked range on
 * the scrub bar.
 * @module utils/media/previewPlayer
 */

import { getMarks, markedRange } from '#utils/media/ranges.js';
import { isPlaying, pause } from '#utils/playback/transport.js';

/**
 * @typedef {Object} PreviewHost
 * @property {import('#utils/media/library.js').MediaItem} item
 * @property {number} time - Preview position, seconds
 * @property {boolean} playing
 */

/** @typedef {PreviewHost & HTMLElement} Host */

/** @param {Host} host @returns {HTMLMediaElement|null} */
export const player = (host) => host.querySelector('video, audio');

/** @param {Host} host */
export function handlePlayPause(host) {
  const media = player(host);
  if (!media) return;
  if (!media.paused) return media.pause();
  const range = markedRange(getMarks(host.item.filePath), host.item.duration);
  const outside =
    range &&
    (media.currentTime < range.sourceIn || media.currentTime >= (range.sourceOut ?? Infinity));
  if (outside) media.currentTime = range.sourceIn;
  if (isPlaying()) pause(); // one thing sounds at a time
  media.play().catch((err) => console.warn('[quicklook] could not play:', err.message));
}

/** @param {Host} host @param {Event} event */
export function handleMediaEvent(host, event) {
  const media = /** @type {HTMLMediaElement} */ (event.target);
  const out = getMarks(host.item.filePath).out;
  if (!media.paused && out !== null && media.currentTime >= out) {
    media.pause();
    media.currentTime = out;
  }
  host.time = media.currentTime;
  host.playing = !media.paused && !media.ended;
}

// Media events do not bubble: the stage listens for them in the capture phase.
handleMediaEvent.options = true;

/** @param {Host} host @param {Event} event */
export function handleScrub(host, event) {
  const time = Number(/** @type {HTMLInputElement} */ (event.target).value);
  const media = player(host);
  if (media) media.currentTime = time;
  host.time = time;
}

/**
 * Where the marked range sits on the scrub bar, as CSS percentages.
 * @param {import('#utils/media/library.js').MediaItem} item
 * @returns {Record<string, string>}
 */
export function rangeStyle(item) {
  const range = markedRange(getMarks(item.filePath), item.duration);
  const total = item.duration > 0 ? item.duration : 0;
  if (!range || !total) return { '--mark-in': '0%', '--mark-out': '0%' };
  const pct = (/** @type {number} */ t) => `${Math.min(100, (t / total) * 100).toFixed(2)}%`;
  return { '--mark-in': pct(range.sourceIn), '--mark-out': pct(range.sourceOut ?? total) };
}
