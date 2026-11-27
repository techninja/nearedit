/**
 * Pointer behaviour of the preview overlay (`<preview-overlay>`): press a
 * clip in the picture to select it, drag it to move it, drag a corner to
 * scale (Shift: width and height separately), drag the round handle to
 * rotate (Shift: 15° stops). A drag is one gesture of the edit session —
 * one undo step — and writes through `setValueAt`, so an animated property
 * gets a key at the playhead. Alt switches snapping off; Alt-click selects
 * what lies beneath. Works the same for mouse, pen and touch.
 * @module utils/preview/overlayEvents
 */

import { setValueAt } from '#utils/edl/autoKey.js';
import { parseResolution } from '#utils/edl/factory.js';
import { getDoc } from '#utils/editor/session.js';
import { clearSelection, getSelection, setSelection } from '#utils/editor/view.js';
import { keyTimeFor } from '#utils/inspector/apply.js';
import { cancelEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { getPosition, isPlaying } from '#utils/playback/transport.js';
import { boxBounds, boxContains, framePoint } from './boxQuery.js';
import { dragValues } from './dragValues.js';
import { clipAtPoint } from './hit.js';
import { layerBox } from './layerBox.js';
import { overlayTarget } from './overlayModel.js';

/**
 * @typedef {Object} PreviewOverlayHost
 * @property {any} doc - The open document
 * @property {import('#store/ViewState.js').ViewStateShape} view
 * @property {{ footage?: (clip: any) => import('./geometry.js').Size|null }} sizes -
 *   `footage`: size of the frame a video clip shows, from the preview's players
 * @property {import('./snap.js').Guide[]} guides - Snap lines of the drag under way
 * @property {boolean} safe - Show the title-safe and action-safe areas
 * @property {number} revision - Bumped when a size or a font arrives
 */

/** @typedef {PreviewOverlayHost & HTMLElement} Host */

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_START = 3;
/** Extra reach around a box, CSS pixels, so its edge is easy to grab. */
const GRAB_SLACK = 6;

/** @type {WeakMap<HTMLElement, any>} The drag under way, per overlay */
const drags = new WeakMap();

/**
 * @param {Host} host
 * @param {number} time
 * @returns {(layer: any) => import('./geometry.js').Box|null}
 */
export const boxerOf = (host, time) => (layer) =>
  layerBox(getDoc(), layer, time, host.sizes?.footage);

/** @param {Host} host @param {PointerEvent} event */
export function handleDown(host, event) {
  if (event.button !== 0 || isPlaying()) return;
  const surface = /** @type {HTMLElement} */ (event.currentTarget);
  const doc = getDoc();
  const time = getPosition();
  const rect = surface.getBoundingClientRect();
  const out = parseResolution(doc.resolution);
  const scale = rect.width / out.width || 1;
  const point = framePoint(event, rect, out);
  const boxOf = boxerOf(host, time);
  const target = /** @type {HTMLElement} */ (event.target);
  const handle = /** @type {HTMLElement|null} */ (target.closest?.('[data-handle]'));
  if (target.closest?.('button:not([data-handle])')) return; // the guides switch
  let chosen = overlayTarget(doc, getSelection(), time, boxOf);
  const selectedId = chosen?.layer.clip.clipId;
  const inside = chosen && boxContains(chosen.box, point, GRAB_SLACK / scale);
  const opts = { beneath: event.altKey ? selectedId : undefined };
  const under = clipAtPoint(doc, time, point, boxOf, opts);
  /** @type {string} What a click without a drag selects */
  let pick = '';
  if (!handle && inside) pick = under && under !== selectedId ? under : '';
  else if (!handle) {
    if (!under) return clearSelection();
    setSelection([under]);
    chosen = overlayTarget(doc, [under], time, boxOf);
  }
  event.preventDefault();
  if (!chosen || chosen.locked) return;
  const mode = handle?.dataset.handle || 'move';
  if (mode !== 'rotate' && !chosen.movable) return;
  const { clip } = chosen.layer;
  drags.set(host, {
    mode,
    pick,
    clipId: clip.clipId,
    time: keyTimeFor(clip, time),
    start: { point, box: chosen.box },
    bounds: boxBounds(chosen.box),
    from: { x: event.clientX, y: event.clientY },
    rect,
    out,
    scale,
    moved: false,
  });
  surface.setPointerCapture(event.pointerId);
}

/** @param {Host} host @param {PointerEvent} event */
export function handleMove(host, event) {
  const drag = drags.get(host);
  if (!drag) return;
  const travel = Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y);
  if (!drag.moved && travel < DRAG_START) return;
  drag.moved = true;
  const { values, guides } = dragValues(drag, event);
  if (guides.length || host.guides.length) host.guides = guides;
  liveEdit(
    `preview:${drag.mode}`,
    (doc) =>
      Object.entries(values).reduce(
        (next, [path, value]) => setValueAt(next, drag.clipId, path, value, drag.time),
        doc,
      ),
    host,
  );
}

/** @param {Host} host @param {PointerEvent} event */
export function handleUp(host, event) {
  const drag = drags.get(host);
  drags.delete(host);
  if (!drag) return;
  if (host.guides.length) host.guides = [];
  if (drag.moved) return event.type === 'pointercancel' ? cancelEdit() : void finishEdit();
  if (drag.pick && event.type === 'pointerup') setSelection([drag.pick]);
}
