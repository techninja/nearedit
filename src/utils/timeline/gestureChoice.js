/**
 * The tiny state machine in front of every pointer interaction: given what
 * is under the pointer and which buttons and modifiers are down, decide
 * which gesture a drag starts and which cursor announces it. Pure.
 * @module utils/timeline/gestureChoice
 */

/** @typedef {import('./hitTest.js').Hit} Hit */

/**
 * @typedef {'pan'|'scrub'|'loop'|'marker'|'move'|'slip'|'trim-start'|'trim-end'|
 *   'fade-in'|'fade-out'|'marquee'|'none'} GestureName
 */

/**
 * @typedef {Object} PointerInput
 * @property {number} [button=0] - 0 primary, 1 middle, 2 secondary
 * @property {string} [pointerType='mouse'] - mouse, pen or touch
 * @property {boolean} [altKey]
 * @property {boolean} [shiftKey]
 * @property {boolean} [ctrlKey]
 * @property {boolean} [metaKey]
 * @property {boolean} [panKey] - The pan key (Space) is held
 */

/**
 * Which gesture a press at `hit` begins.
 * @param {Hit} hit
 * @param {PointerInput} [input]
 * @returns {GestureName}
 */
export function chooseGesture(hit, input = {}) {
  const { button = 0, pointerType = 'mouse' } = input;
  if (button === 1 || (button === 0 && input.panKey)) return 'pan';
  if (button !== 0) return 'none';
  if (hit.zone === 'ruler') {
    if (hit.band === 'loop' || input.shiftKey) return 'loop';
    return hit.markerId ? 'marker' : 'scrub';
  }
  if (hit.zone !== 'lane') return pointerType === 'touch' ? 'pan' : 'marquee';
  if (!hit.clipId || hit.locked) return pointerType === 'touch' ? 'pan' : 'marquee';
  if (hit.part && hit.part !== 'body') return hit.part;
  return input.altKey ? 'slip' : 'move';
}

/** @type {Record<GestureName, string>} Cursor shown while hovering. */
const HOVER_CURSOR = {
  pan: 'grab',
  scrub: 'default',
  loop: 'col-resize',
  marker: 'pointer',
  move: 'grab',
  slip: 'ew-resize',
  'trim-start': 'w-resize',
  'trim-end': 'e-resize',
  'fade-in': 'nesw-resize',
  'fade-out': 'nwse-resize',
  marquee: 'default',
  none: 'default',
};

/** @type {Partial<Record<GestureName, string>>} Cursor shown while dragging, where it differs. */
const ACTIVE_CURSOR = {
  pan: 'grabbing',
  move: 'grabbing',
  marker: 'ew-resize',
  marquee: 'crosshair',
  scrub: 'ew-resize',
};

/**
 * The cursor that tells what a drag from here would do.
 * @param {Hit} hit
 * @param {PointerInput} [input]
 * @returns {string} A CSS cursor value
 */
export function cursorFor(hit, input = {}) {
  if (hit.zone === 'lane' && hit.clipId && hit.locked && !input.panKey) return 'not-allowed';
  return HOVER_CURSOR[chooseGesture(hit, { ...input, button: 0 })];
}

/**
 * The cursor while a gesture is in progress.
 * @param {GestureName} gesture
 * @returns {string} A CSS cursor value
 */
export function activeCursor(gesture) {
  return ACTIVE_CURSOR[gesture] || HOVER_CURSOR[gesture];
}

/**
 * How far the pointer must travel before a press becomes a drag.
 * @param {string} [pointerType]
 * @returns {number} CSS pixels
 */
export function dragThreshold(pointerType) {
  return pointerType === 'touch' ? 8 : 4;
}

/**
 * True when a click with these modifiers should toggle a clip in the
 * selection instead of replacing the selection.
 * @param {PointerInput} input
 * @returns {boolean}
 */
export function isToggleClick(input) {
  return !!(input.ctrlKey || input.metaKey || input.shiftKey);
}
