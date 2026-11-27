/**
 * The pan key. Holding Space and dragging pans the timeline, yet Space is
 * also play / stop. Both work because of when the command runs:
 *
 * - while playing, Space acts on key-down (stopping must be immediate);
 * - while stopped, it acts on key-up — unless a pan drag used the hold.
 *
 * The keyboard handler feeds this module; the timeline's pointer code asks
 * it whether the key is held and tells it when a drag used the hold.
 * @module utils/keyboard/panKey
 */

let held = false;
let used = false;
/** @type {(() => void)|null} What to run on release */
let pending = null;

/** @returns {boolean} True while the pan key is down */
export const isPanKeyHeld = () => held;

/** A pan drag started while the key was held: do not run its command. */
export function consumePanKey() {
  used = true;
}

/**
 * The pan key went down.
 * @param {(() => void)|null} run - The command bound to the key, if any
 * @param {boolean} immediate - Run now (playback is running) instead of on release
 */
export function panKeyDown(run, immediate) {
  if (held) return;
  held = true;
  used = false;
  pending = null;
  if (!run) return;
  if (immediate) run();
  else pending = run;
}

/** The pan key came up: run the deferred command unless a drag used the hold. */
export function panKeyUp() {
  const run = pending;
  const wasUsed = used;
  panKeyReset();
  if (run && !wasUsed) run();
}

/** Forget the key (window lost focus mid-hold). */
export function panKeyReset() {
  held = false;
  used = false;
  pending = null;
}
