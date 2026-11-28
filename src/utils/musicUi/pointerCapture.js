/**
 * Keeping a drag with the element it began on, so it goes on when the
 * pointer leaves it.
 * @module utils/musicUi/pointerCapture
 */

/**
 * @param {Element} element
 * @param {PointerEvent} event - The `pointerdown` that begins the drag
 */
export function capturePointer(element, event) {
  try {
    element.setPointerCapture(event.pointerId);
  } catch (err) {
    // A pointer that is already gone (or a scripted one) cannot be captured;
    // the drag then simply ends at the element's edge.
    console.debug('[music] the pointer was not captured:', err.message);
  }
}
