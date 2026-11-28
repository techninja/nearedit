/**
 * Which file a clip's picture is played from. A clip drawn through its
 * matte plays its cutout file — the picture with its matte beside it — in
 * place of its own, at the frame that belongs to the moment
 * (`cutoutShown`); every other clip, a moment the cutout does not hold,
 * and a cutout file that cannot be loaded play the clip's own file, and
 * the compositor, which knows a packed frame by its shape, draws the plain
 * picture. Sound never comes from here: the mixer plays the clip's own file.
 * Contract: docs/app-spec/CUTOUT.md § Drawing.
 * @module utils/playback/pictureSource
 */

import { cutoutFps, cutoutShown } from '#utils/cutout/index.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { aimSlot, driveSlot } from '#utils/playback/videoSlot.js';

/** Seek just inside the frame, so float error never lands on the one before. */
const SEEK_NUDGE = 0.001;
/** A cutout file that failed to load is tried again after this long, ms. */
const RETRY_MS = 10_000;

/**
 * @typedef {import('#utils/playback/videoSlot.js').VideoSlot} VideoSlot
 * @typedef {ReturnType<typeof import('#utils/playback/videoPool.js').createVideoPool>} VideoPool
 */

/**
 * Where a moment of a clip's source is in the file its picture plays from.
 * @param {any} clip
 * @param {number} sourceTime - Seconds into the clip's media file
 * @param {(url: string) => boolean} [usable] - Whether a cutout file may be tried
 * @returns {{ url: string, cutout: boolean, still: number, playing: number }}
 *   `still`: where to seek a paused element so that it shows the frame;
 *   `playing`: where a playing element should be
 */
export function pictureAt(clip, sourceTime, usable = () => true) {
  const shown = cutoutShown(clip, sourceTime);
  const url = shown ? pictureUrl(shown.made.file) : '';
  if (!shown || !usable(url)) {
    const plain = pictureUrl(clip.sourceFile);
    return { url: plain, cutout: false, still: sourceTime + SEEK_NUDGE, playing: sourceTime };
  }
  // The middle of the frame: a seek lands on it whatever the container rounds.
  const still = (shown.frame + 0.5) / cutoutFps(shown.made.fps);
  return { url, cutout: true, still, playing: Math.max(0, sourceTime - shown.made.start) };
}

/**
 * Bind the choice to a video pool.
 * @param {VideoPool} videos
 * @param {() => number} [now] - The clock, ms (for tests)
 */
export function createPictureSource(videos, now = Date.now) {
  /** @type {Map<string, number>} Cutout files that failed to load, and when to try again */
  const broken = new Map();
  /** @type {Set<string>} Cutout files asked for */
  const cutouts = new Set();
  const usable = (/** @type {string} */ url) => !(now() < (broken.get(url) ?? 0));

  /**
   * The slot that shows a clip's picture, loading the right file.
   * @param {any} clip
   * @param {number} sourceTime
   * @returns {{ slot: VideoSlot, at: ReturnType<typeof pictureAt> }}
   */
  function slotFor(clip, sourceTime) {
    let at = pictureAt(clip, sourceTime, usable);
    let slot = videos.acquire(clip.clipId, at.url);
    if (at.cutout && slot.failed) {
      broken.set(at.url, now() + RETRY_MS);
      at = pictureAt(clip, sourceTime, usable);
      slot = videos.acquire(clip.clipId, at.url);
    }
    if (at.cutout) cutouts.add(at.url);
    return { slot, at };
  }

  return {
    /**
     * Paused: point the clip's element at the frame of a moment.
     * @param {any} clip
     * @param {number} sourceTime
     */
    park(clip, sourceTime) {
      const { slot, at } = slotFor(clip, sourceTime);
      aimSlot(slot, at.still);
    },

    /**
     * Playing: keep the clip's element on the clock.
     * @param {any} clip
     * @param {number} sourceTime
     * @param {number} nowMs - performance.now()
     */
    play(clip, sourceTime, nowMs) {
      const { slot, at } = slotFor(clip, sourceTime);
      driveSlot(slot, at.playing, nowMs);
    },

    /**
     * Whether a cutout file has failed to load since it was asked for: its
     * clips then need pointing at their own files (`park` again).
     * @returns {boolean}
     */
    lost() {
      const failed = videos.slots().filter((slot) => slot.failed && cutouts.has(slot.url));
      for (const slot of failed) {
        if (usable(slot.url))
          console.warn('[playback] cutout file missing, showing the clip:', slot.url);
        broken.set(slot.url, now() + RETRY_MS);
      }
      return failed.length > 0;
    },
  };
}
