/**
 * What a turn of the mouse wheel does on the timeline, in the two modes
 * the user chooses between. Pure.
 *
 * - `scroll` (NearEdit): the wheel scrolls — the tracks when they overflow,
 *   time otherwise or with Shift — and Ctrl/Cmd+wheel zooms about the
 *   pointer (which is also how browsers report a trackpad pinch).
 * - `vegas`: the wheel zooms about the pointer, Shift+wheel scrolls time,
 *   Ctrl+wheel scrolls the tracks, Ctrl+Shift+wheel moves the cursor.
 *   Sideways wheel movement (a trackpad) scrolls time in both modes.
 * @module utils/timeline/wheel
 */

import { wheelZoomFactor } from './viewport.js';

/** Pixels the cursor travels per pixel of wheel movement (a notch is about 100). */
const CURSOR_GEAR = 0.1;

/**
 * @typedef {Object} WheelInput
 * @property {number} dx - Sideways movement, pixels
 * @property {number} dy - Vertical movement, pixels (positive = towards the user)
 * @property {boolean} [ctrlKey]
 * @property {boolean} [metaKey]
 * @property {boolean} [shiftKey]
 * @property {boolean} [tracksOverflow] - The tracks do not all fit in the view
 */

/**
 * @typedef {{ kind: 'zoom', factor: number, dx: number }
 *   | { kind: 'scroll', dx: number, dy: number }
 *   | { kind: 'cursor', pixels: number }} WheelAction
 *   `zoom`: multiply the zoom by `factor` about the pointer (and scroll time
 *   by `dx`); `scroll`: by that many pixels; `cursor`: move the edit cursor
 *   by that many pixels of time
 */

/**
 * @param {WheelInput} input
 * @param {'scroll'|'vegas'} [mode='scroll']
 * @returns {WheelAction}
 */
export function wheelAction(input, mode = 'scroll') {
  const { dx, dy, shiftKey } = input;
  const ctrl = !!(input.ctrlKey || input.metaKey);
  if (mode !== 'vegas') {
    if (ctrl) return { kind: 'zoom', factor: wheelZoomFactor(dy), dx: 0 };
    if (shiftKey || !input.tracksOverflow) return { kind: 'scroll', dx: dx + dy, dy: 0 };
    return { kind: 'scroll', dx, dy };
  }
  if (ctrl && shiftKey) return { kind: 'cursor', pixels: (dx + dy) * CURSOR_GEAR };
  if (ctrl) return { kind: 'scroll', dx, dy };
  if (shiftKey) return { kind: 'scroll', dx: dx + dy, dy: 0 };
  return { kind: 'zoom', factor: wheelZoomFactor(dy), dx };
}
