/**
 * Behaviour of the inspector's "Cut out person" group (`<cutout-inspector>`):
 * the switch and the settings edit the `cutout` block of every selected
 * clip that can be cut out — dragging a slider is one undo step — a
 * placement and a look are one edit each, and the status row's buttons
 * cancel a job or ask again.
 * @module utils/cutoutUi/inspectorEvents
 */

import { setCutout } from '#utils/edl/index.js';
import { edit } from '#utils/editor/session.js';
import { cancelEdit, commitEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { getMediaItem } from '#utils/media/library.js';
import { subjectsOf } from './inspectorView.js';
import { setLook } from './looks.js';
import { applyPlacement } from './placementEdit.js';
import { cancelCutout, retryCutout } from './runtime.js';

/**
 * @typedef {Object} CutoutInspectorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {import('./state.js').CutoutJobs} jobs
 */

/** @typedef {CutoutInspectorHost & HTMLElement} Host */

/** @type {(host: Host) => string[]} The clips an edit goes to */
const idsOf = (host) => subjectsOf(host.model).map((ref) => ref.clip.clipId);

/**
 * The picture of a clip's media file as it is shown (a phone's video is
 * stored on its side).
 * @param {any} clip
 * @returns {{ width: number, height: number }|null} null until the media list knows it
 */
export function sourceSize(clip) {
  const item = getMediaItem(clip?.sourceFile);
  if (!item || !(item.width > 0 && item.height > 0)) return null;
  const { width, height } = item;
  return Math.abs(item.rotation || 0) % 180 === 90 ? { width: height, height: width } : item;
}

/** The switch. @param {Host} host @param {Event} event */
export function handleSwitch(host, event) {
  const { checked } = /** @type {HTMLInputElement} */ (event.target);
  const ids = idsOf(host);
  event.stopPropagation();
  commitEdit('cutout.on', (doc) => setCutout(doc, ids, { on: checked }));
}

/**
 * A setting changed (`field-change` of a value box named `cutout.<field>`).
 * @param {Host} host
 * @param {CustomEvent<import('#utils/inspector/fieldEvents.js').FieldChangeDetail>} event
 */
export function handleField(host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  if (phase === 'cancel') return cancelEdit();
  const ids = idsOf(host);
  const patch = { [name.replace(/^cutout\./, '')]: value };
  /** @type {(doc: any) => any} */
  const operation = (doc) => setCutout(doc, ids, patch);
  if (phase === 'live') liveEdit(name, operation, /** @type {Element} */ (event.target));
  else commitEdit(name, operation);
}

/** Remove or blur. @param {Host} host @param {Event} event */
export function handleMode(host, event) {
  const { value } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const mode = /** @type {'remove'|'blur'} */ (value);
  const ids = idsOf(host);
  commitEdit('cutout.mode', (doc) => setCutout(doc, ids, { mode }));
}

/** A placement button: one undo step. @param {Host} host @param {Event} event */
export function handlePlacement(host, event) {
  const { place } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const ids = idsOf(host);
  finishEdit();
  edit((doc) => applyPlacement(doc, ids, place, sourceSize));
}

/** Shadow or outline, on or off. @param {Host} host @param {Event} event */
export function handleLook(host, event) {
  const button = /** @type {HTMLElement} */ (event.currentTarget);
  const look = /** @type {import('./looks.js').Look} */ (button.dataset.look);
  const on = button.getAttribute('aria-pressed') !== 'true';
  const ids = idsOf(host);
  finishEdit();
  edit((doc) => setLook(doc, ids, look, on));
}

/** Stop making a file's cutout. @param {Host} _host @param {Event} event */
export function handleCancel(_host, event) {
  cancelCutout(/** @type {HTMLElement} */ (event.currentTarget).dataset.path);
}

/** Ask again for a file's cutout. @param {Host} _host @param {Event} event */
export function handleRetry(_host, event) {
  retryCutout(/** @type {HTMLElement} */ (event.currentTarget).dataset.path);
}

/** Have the server look again for its matte program. */
export function handleCheck() {
  retryCutout();
}
