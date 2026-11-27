/**
 * Where a small pop-up menu goes: under the button that opened it, lined
 * up with the button's right edge, flipped above when there is no room
 * below, and never outside the window. Pure and isomorphic.
 * @module utils/inspector/popup
 */

/** Gap between the button and its menu, and between the menu and the window edge. */
const GAP = 4;

/**
 * @param {{ left: number, right: number, top: number, bottom: number }} anchor -
 *   The button on screen (`getBoundingClientRect`)
 * @param {{ width: number, height: number }} menu - Expected size of the menu
 * @param {{ width: number, height: number }} viewport
 * @returns {{ left: number, top: number, maxHeight: number }} Fixed position, pixels
 */
export function placeMenu(anchor, menu, viewport) {
  const below = viewport.height - anchor.bottom - GAP * 2;
  const above = anchor.top - GAP * 2;
  const under = below >= Math.min(menu.height, 160) || below >= above;
  const maxHeight = Math.max(80, Math.min(menu.height, under ? below : above));
  const top = under ? anchor.bottom + GAP : Math.max(GAP, anchor.top - GAP - maxHeight);
  const left = Math.min(
    Math.max(GAP, anchor.right - menu.width),
    Math.max(GAP, viewport.width - menu.width - GAP),
  );
  return { left: Math.round(left), top: Math.round(top), maxHeight: Math.round(maxHeight) };
}
