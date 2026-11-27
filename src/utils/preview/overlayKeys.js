/**
 * Keyboard and switches of the preview overlay: with the clip's box
 * focused the arrow keys nudge it a pixel at a time (Shift: ten) — one
 * undo step per held key — and the guides switch shows the title-safe and
 * action-safe areas (remembered in this browser).
 * @module utils/preview/overlayKeys
 */

import { setValueAt } from '#utils/edl/autoKey.js';
import { getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { keyTimeFor } from '#utils/inspector/apply.js';
import { finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { getPosition } from '#utils/playback/transport.js';
import { readStored, writeStored } from '#utils/ui/storage.js';
import { boxerOf } from './overlayEvents.js';
import { overlayTarget } from './overlayModel.js';

/** @typedef {import('./overlayEvents.js').PreviewOverlayHost & HTMLElement} Host */

/** localStorage key of the overlay's preferences. */
export const PREVIEW_PREFS_KEY = 'nearedit_preview';

const STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** @type {WeakMap<HTMLElement, { clipId: string, time: number, x: number, y: number, dx: number, dy: number }>} */
const nudges = new WeakMap();

/** @returns {boolean} Whether the safe areas were left switched on */
export const storedSafe = () => readStored(PREVIEW_PREFS_KEY).safe === true;

/** @param {Host} host */
export function handleSafe(host) {
  host.safe = !host.safe;
  writeStored(PREVIEW_PREFS_KEY, { safe: host.safe });
}

/**
 * Arrow keys on the focused box move the clip.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleKeys(host, event) {
  const step = STEPS[event.key];
  if (!step || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  let nudge = nudges.get(host);
  if (!nudge) {
    const time = getPosition();
    const target = overlayTarget(getDoc(), getSelection(), time, boxerOf(host, time));
    if (!target || target.locked || !target.movable) return;
    const { clip } = target.layer;
    const { x, y } = target.box.transform;
    nudge = { clipId: clip.clipId, time: keyTimeFor(clip, time), x, y, dx: 0, dy: 0 };
    nudges.set(host, nudge);
  }
  const size = event.shiftKey ? 10 : 1;
  nudge.dx += step[0] * size;
  nudge.dy += step[1] * size;
  const { clipId, time, x, y, dx, dy } = nudge;
  liveEdit(
    'preview:nudge',
    (doc) =>
      setValueAt(
        setValueAt(doc, clipId, 'transform.x', Math.round(x + dx), time),
        clipId,
        'transform.y',
        Math.round(y + dy),
        time,
      ),
    host,
  );
}

/** Releasing the key ends the nudge: one undo step. @param {Host} host @param {KeyboardEvent} event */
export function handleKeyUp(host, event) {
  if (!(event.key in STEPS)) return;
  if (nudges.delete(host)) finishEdit();
}
