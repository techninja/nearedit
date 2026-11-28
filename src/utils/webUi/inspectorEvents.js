/**
 * Behaviour of the inspector's "Web page" group (`<web-inspector>`): its
 * buttons open the web editor, start and cancel a recording, and write or
 * remove zoom keyframes; its two number boxes are the zoom settings.
 * @module utils/webUi/inspectorEvents
 */

import { isWebClip } from '#utils/web/index.js';
import { openWebEditor } from './editorState.js';
import { cancelRecording, recordClip } from './recording.js';
import { applyZoom, removeZoom, setZoomOption } from './zoom.js';

/**
 * @typedef {Object} WebInspectorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {{ byClip: Record<string, import('./clipStatus.js').RecordingProgress> }} recordings
 * @property {{ margin: number, maxZoom: number }} zoom
 * @property {string} message - Why zooming did not work
 * @property {boolean} working - The recording's track is being fetched
 */

/** @typedef {WebInspectorHost & HTMLElement} Host */

/**
 * @param {{ model: WebInspectorHost['model'] }} host
 * @returns {{ clip: any, track: any }|null} The web clip the group is about:
 *   the one selected clip, when it is a web clip
 */
export function subjectOf({ model }) {
  const refs = (model.refs || []).filter((ref) => isWebClip(ref.clip));
  return refs.length === 1 && model.refs.length === 1 ? refs[0] : null;
}

/** @type {(host: Host) => string} */
const clipIdOf = (host) => subjectOf(host)?.clip.clipId || '';

/** @param {Host} host */
export function handleEdit(host) {
  openWebEditor(clipIdOf(host));
}

/** @param {Host} host */
export function handleRecord(host) {
  host.message = '';
  recordClip(clipIdOf(host));
}

/** @param {Host} host */
export function handleCancel(host) {
  cancelRecording(clipIdOf(host));
}

/**
 * Run something that may need the recording's track, showing why it failed.
 * @param {Host} host
 * @param {() => Promise<string>} work - Resolves to '' or a reason
 */
async function attempt(host, work) {
  host.working = true;
  host.message = '';
  const message = await work();
  host.working = false;
  host.message = message;
}

/** @param {Host} host */
export function handleZoom(host) {
  const clipId = clipIdOf(host);
  attempt(host, () => applyZoom(clipId));
}

/** @param {Host} host */
export function handleRemoveZoom(host) {
  host.message = '';
  removeZoom(clipIdOf(host));
}

/** A zoom setting was changed. @param {Host} host @param {Event} event */
export function handleOption(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const value = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(value)) return;
  const name = /** @type {'margin'|'maxZoom'} */ (input.dataset.name);
  const clipId = clipIdOf(host);
  attempt(host, () => setZoomOption(name, value, clipId));
}
