/**
 * Preview compositor — draws the timeline's picture on a 2D canvas.
 *
 * Two modes, one painter:
 * - `renderPlaying(doc, time)` every animation frame while the transport
 *   runs: video elements play natively and are kept on the clock; clips
 *   about to start are loaded and parked on their first frame so a cut
 *   never flashes black.
 * - `scrub(doc, time)` while paused: seek, and paint when the frames are
 *   there. Requests are not queued — a slot always chases the newest time,
 *   and the last thing painted is always the newest request, exactly.
 *
 * @module utils/playback/compositor
 */

import { parseResolution } from '#utils/edl/factory.js';
import { sourceTimeAt } from '#utils/edl/query.js';
import { createImageCache } from '#utils/playback/imageCache.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { paintFrame } from '#utils/playback/paintFrame.js';
import { videoCues, videoLayers } from '#utils/playback/schedule.js';
import { createVideoPool } from '#utils/playback/videoPool.js';
import { aimSlot, driveSlot, hasFrame, isSettled } from '#utils/playback/videoSlot.js';

/** Seconds before a clip is due that its video is loaded and parked. */
export const VIDEO_PREROLL = 1.5;

/** Seek just inside the frame, so float error never lands on the one before. */
const SEEK_NUDGE = 0.001;

/**
 * @typedef {{ tracks: any[], resolution: string }} FrameDoc
 * @typedef {ReturnType<typeof createCompositor>} Compositor
 */

/**
 * Create a compositor bound to a canvas.
 * @param {HTMLCanvasElement} canvas
 */
export function createCompositor(canvas) {
  const surface = { canvas, ctx: canvas.getContext('2d', { alpha: false }), scratch: null };
  const videos = createVideoPool(onMedia);
  const images = createImageCache(onMedia);
  /** @type {{ doc: FrameDoc, time: number }|null} The newest paused request */
  let request = null;
  let dirty = true;
  let paints = 0;

  /**
   * The picture for a layer, or null when it has none ready.
   * @param {import('#utils/playback/schedule.js').Cue} cue
   * @returns {import('#utils/playback/paintFrame.js').Picture|null}
   */
  function pictureFor(cue) {
    if (cue.kind === 'image') {
      const { image, ready } = images.get(pictureUrl(cue.clip.sourceFile));
      return ready ? { image, width: image.naturalWidth, height: image.naturalHeight } : null;
    }
    const slot = videos.find(cue.clip.clipId);
    if (!slot || !hasFrame(slot)) return null;
    return { image: slot.el, width: slot.el.videoWidth, height: slot.el.videoHeight };
  }

  /**
   * @param {FrameDoc} doc
   * @param {number} time
   */
  function paint(doc, time) {
    paintFrame(surface, doc.tracks, time, parseResolution(doc.resolution), pictureFor);
    paints++;
  }

  /**
   * Can the paused request be painted without a hole? `exact` also demands
   * that every video shows precisely the requested frame.
   * @param {boolean} exact
   * @returns {boolean}
   */
  function drawable(exact) {
    for (const cue of videoLayers(request.doc.tracks, request.time)) {
      if (cue.kind === 'image') {
        const still = images.get(pictureUrl(cue.clip.sourceFile));
        if (!still.ready && !still.failed) return false;
      }
      if (cue.kind !== 'video') continue;
      const slot = videos.find(cue.clip.clipId);
      if (!slot || !(exact ? isSettled(slot) : slot.failed || hasFrame(slot))) return false;
    }
    return true;
  }

  /** A frame or still arrived: show the newest paused request with it. */
  function onMedia() {
    if (request && drawable(false)) paint(request.doc, request.time);
  }

  return {
    /**
     * Paused: show the frame at `time`. Repeat calls with nothing new are
     * free — documents are never mutated, so the same object is the same
     * picture and every edit arrives as a new one.
     */
    scrub(/** @type {FrameDoc} */ doc, /** @type {number} */ time) {
      if (request && request.doc === doc && request.time === time && !dirty) return;
      request = { doc, time };
      dirty = false;
      const wanted = new Set();
      for (const { clip, kind } of videoLayers(doc.tracks, time)) {
        if (kind !== 'video') continue;
        wanted.add(clip.clipId);
        const slot = videos.acquire(clip.clipId, pictureUrl(clip.sourceFile));
        aimSlot(slot, sourceTimeAt(clip, time) + SEEK_NUDGE);
      }
      videos.retain(wanted);
      if (drawable(true)) paint(doc, time);
    },

    /** Playing: keep videos on the clock, prepare what is coming, paint. */
    renderPlaying(/** @type {FrameDoc} */ doc, /** @type {number} */ time) {
      request = null;
      dirty = true;
      const wanted = new Set();
      const nowMs = performance.now();
      for (const { clip, kind, active } of videoCues(doc.tracks, time, VIDEO_PREROLL)) {
        if (kind === 'image') images.get(pictureUrl(clip.sourceFile));
        if (kind !== 'video') continue;
        wanted.add(clip.clipId);
        const slot = videos.acquire(clip.clipId, pictureUrl(clip.sourceFile));
        if (active) driveSlot(slot, sourceTimeAt(clip, time), nowMs);
        else aimSlot(slot, clip.sourceIn + SEEK_NUDGE);
      }
      videos.retain(wanted);
      paint(doc, time);
    },

    /** The canvas was resized (which clears it): repaint on the next scrub. */
    invalidate: () => void (dirty = true),

    /** Counters and element states, for diagnostics and tests. */
    stats: () => ({ paints, images: images.size(), slots: videos.slots() }),

    /** Release every media element. */
    destroy() {
      request = null;
      videos.destroy();
      images.clear();
    },
  };
}
