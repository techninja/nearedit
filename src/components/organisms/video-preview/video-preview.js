/**
 * Video preview — the program monitor. Shows the timeline's picture at the
 * adaptation's aspect ratio: the transport feeds it frames while playing,
 * and while paused it follows the playhead and the document (scrub). The
 * picture is always drawn from the edit session's current document. Over
 * the picture lies the overlay for direct manipulation (`<preview-overlay>`).
 * @module components/organisms/video-preview
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { getDoc } from '#utils/editor/session.js';
import { createPreviewSurface } from '#utils/playback/previewSurface.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { isPlaying, onFrame, shutdown } from '#utils/playback/transport.js';
import { warmAudio } from '#utils/playback/warmup.js';
import '#molecules/preview-overlay/preview-overlay.js';

/**
 * @typedef {Object} VideoPreviewHost
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline - Summary of the
 *   document, replaced whenever it changes
 * @property {import('#store/ViewState.js').ViewStateShape} view
 */

/** @type {WeakMap<HTMLElement, import('#utils/playback/previewSurface.js').PreviewSurface>} */
const surfaces = new WeakMap();

/**
 * The surface driving a preview's canvas, for diagnostics and tests.
 * @param {HTMLElement} host
 * @returns {import('#utils/playback/previewSurface.js').PreviewSurface|undefined}
 */
export const previewSurface = (host) => surfaces.get(host);

/** @type {WeakMap<HTMLElement, { footage: (clip: any) => { width: number, height: number }|null }>} */
const sizers = new WeakMap();

/**
 * What the overlay needs from the players: the size of the frame a video
 * clip is showing. One object per preview, so the overlay is not handed a
 * new one on every render.
 * @param {HTMLElement} host
 * @returns {{ footage: (clip: any) => { width: number, height: number }|null }}
 */
function sizesOf(host) {
  if (!sizers.has(host)) {
    const footage = (/** @type {any} */ clip) => {
      const slots = surfaces.get(host)?.compositor.stats().slots || [];
      const video = slots.find((slot) => slot.clipId === clip.clipId)?.el;
      return video?.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : null;
    };
    sizers.set(host, { footage });
  }
  return sizers.get(host);
}

/**
 * After every render — so after every change of the document or the view:
 * make sure the canvas has a surface, that the audio of a new document is
 * being prepared and, while paused, that the canvas shows the playhead
 * frame of the current document.
 * @param {VideoPreviewHost & HTMLElement} host
 */
function refresh(host) {
  let surface = surfaces.get(host);
  if (!surface) {
    const canvas = host.querySelector('canvas');
    if (!canvas) return;
    surface = createPreviewSurface(canvas, canvas.closest('.video-preview'));
    surfaces.set(host, surface);
  }
  const doc = getDoc();
  warmAudio(doc.tracks);
  if (!isPlaying()) surface.show(doc, host.view.playheadPosition);
}

/**
 * Take frames from the transport while connected; on disconnect stop
 * playback and release media elements and audio nodes.
 * @param {VideoPreviewHost & HTMLElement} host
 * @returns {() => void}
 */
function connect(host) {
  const stopFrames = onFrame((time) => surfaces.get(host)?.play(getDoc(), time));
  return () => {
    stopFrames();
    surfaces.get(host)?.destroy();
    surfaces.delete(host);
    shutdown();
  };
}

/** @type {import('hybrids').Component<VideoPreviewHost>} */
export default define({
  tag: 'video-preview',
  timeline: store(TimelineState),
  view: store(ViewState),
  render: {
    value: (host) => html`
      <div class="video-preview">
        <div class="preview-frame">
          <canvas role="img" aria-label="Program preview"></canvas>
          <preview-overlay sizes="${sizesOf(host)}"></preview-overlay>
          <span class="preview-timecode" aria-hidden="true"
            >${formatTimecode(host.view.playheadPosition, host.timeline.fps)}</span
          >
        </div>
      </div>
    `,
    shadow: false,
    connect,
    observe: refresh,
  },
});
