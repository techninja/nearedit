/**
 * What is dragged out of the Create tab, next to `MEDIA_DRAG_TYPE` of the
 * media bin: a generator or a text style (dropped on a track of the
 * timeline, it is inserted there) and an effect (dropped on a clip, it is
 * added to that clip). The payload travels as JSON under its MIME type.
 * A browser only reveals the types while a drag is over a target, never
 * the data, so the payload of the drag under way is also kept here for
 * the drop indicator to read.
 * @module utils/create/dragTypes
 */

/** MIME type of a generator or text style dragged from the Create tab. */
export const CREATE_DRAG_TYPE = 'application/x-nearedit-create';
/** MIME type of an effect (or a chain of effects) dragged from the effect list. */
export const EFFECT_DRAG_TYPE = 'application/x-nearedit-effect';

/**
 * @typedef {{ kind: 'generator', type: string, category?: string, label?: string,
 *   params?: Record<string, any>, seed?: number }
 *   | { kind: 'text', preset: string, label?: string }} CreatePayload
 */

/** @type {{ type: string, payload: any }|null} */
let current = null;

/**
 * Start a drag: put the payload on the event and remember it.
 * @param {DragEvent} event - A `dragstart`
 * @param {string} type - `CREATE_DRAG_TYPE` or `EFFECT_DRAG_TYPE`
 * @param {any} payload - JSON-safe
 */
export function beginDrag(event, type, payload) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(type, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'copy';
  current = { type, payload };
}

/** The drag ended (dropped or abandoned). */
export function endDrag() {
  current = null;
}

/**
 * The payload of the drag under way, when it started in this window.
 * @param {string} type
 * @returns {any} null when no such drag is in progress
 */
export const draggedPayload = (type) => (current?.type === type ? current.payload : null);

/**
 * @param {{ types?: readonly string[] }|null|undefined} dataTransfer
 * @param {string} type
 * @returns {boolean} True when the drag carries that type
 */
export function carries(dataTransfer, type) {
  return Array.from(dataTransfer?.types || []).includes(type);
}

/**
 * Read a dropped payload.
 * @param {{ getData: (type: string) => string }|null|undefined} dataTransfer
 * @param {string} type
 * @returns {any} null when there is none or it is not JSON
 */
export function readPayload(dataTransfer, type) {
  const raw = dataTransfer?.getData(type);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch (err) {
    console.warn('[create] unreadable drag payload:', err.message);
    return null;
  }
}
