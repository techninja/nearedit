/**
 * Video pool — the `<video>` elements that feed frames to the compositor.
 * One element per clip on screen (keyed by clip, so two clips of the same
 * file each get their own), recycled as clips come and go.
 * @module utils/playback/videoPool
 */

import { freshSync, unloadElement } from '#utils/playback/mediaSync.js';
import { createSlot } from '#utils/playback/videoSlot.js';

/** Idle elements kept loaded for reuse; the rest are unloaded. */
const MAX_IDLE = 3;

/**
 * @typedef {import('#utils/playback/videoSlot.js').VideoSlot} VideoSlot
 */

/**
 * Create a pool.
 * @param {() => void} onFrame - Called when any slot has a new frame to show
 * @returns {{
 *   acquire: (clipId: string, url: string) => VideoSlot,
 *   find: (clipId: string) => VideoSlot|undefined,
 *   retain: (clipIds: Set<string>) => void,
 *   slots: () => VideoSlot[],
 *   destroy: () => void,
 * }}
 */
export function createVideoPool(onFrame) {
  /** @type {VideoSlot[]} */
  let slots = [];

  return {
    /** The slot showing a clip: its own, an idle one (ideally holding the file) or a new one. */
    acquire(clipId, url) {
      let slot = slots.find((s) => s.clipId === clipId);
      if (slot && slot.url === url) return slot;
      slot ||= slots.find((s) => !s.clipId && s.url === url) || slots.find((s) => !s.clipId);
      if (!slot) slots.push((slot = createSlot(onFrame)));
      slot.clipId = clipId;
      slot.stale = true;
      slot.sync = freshSync();
      if (slot.url !== url) {
        slot.url = url;
        slot.failed = false;
        slot.el.src = url;
        slot.el.load();
      }
      return slot;
    },

    find: (clipId) => slots.find((slot) => slot.clipId === clipId),

    /** Free every slot whose clip is not in the set; unload the surplus. */
    retain(clipIds) {
      for (const slot of slots) {
        if (!slot.clipId || clipIds.has(slot.clipId)) continue;
        slot.el.pause();
        slot.clipId = '';
        slot.stale = true;
      }
      const idle = slots.filter((slot) => !slot.clipId);
      for (const slot of idle.slice(MAX_IDLE)) {
        slot.url = '';
        unloadElement(slot.el);
        slots = slots.filter((other) => other !== slot);
      }
    },

    slots: () => slots,

    destroy() {
      for (const slot of slots) {
        slot.clipId = '';
        slot.url = '';
        unloadElement(slot.el);
      }
      slots = [];
    },
  };
}
