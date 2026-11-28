/**
 * Where a web clip stands, in words: not recorded, recorded (how long, how
 * large), out of date, or being recorded. Also what the timeline and the
 * export dialog need to know about all of a document's web clips. Pure and
 * isomorphic.
 * @module utils/webUi/clipStatus
 */

import { fpsOf } from '#utils/edl/time.js';
import { webClips } from '#utils/edl/webClip.js';
import { hostOf, isStale, isWebClip, webDuration } from '#utils/web/index.js';
import { recordingSize } from './sizes.js';

/** @typedef {'unrecorded'|'recorded'|'stale'|'recording'} WebState */

/**
 * @typedef {Object} RecordingProgress - A recording under way (recording.js)
 * @property {'starting'|'queued'|'running'|'done'|'error'|'cancelled'} status
 * @property {number} progress - 0..100
 * @property {string} message - Why it failed or was not attached
 * @property {string[]} [warnings] - What the recorder had to say about a
 *   recording that was made (steps it skipped, with `onMissing: skip`)
 */

/**
 * @param {any} clip
 * @param {number} fps
 * @returns {Exclude<WebState, 'recording'>|''} '' for a clip that is not a web clip
 */
export function webState(clip, fps) {
  if (!isWebClip(clip)) return '';
  if (!clip.web.key || !clip.sourceFile) return 'unrecorded';
  return isStale(clip, fps) ? 'stale' : 'recorded';
}

/**
 * @param {RecordingProgress|undefined|null} recording
 * @returns {boolean} True while the browser is (about to be) recording
 */
export const isRecording = (recording) =>
  ['starting', 'queued', 'running'].includes(recording?.status);

/**
 * The status of a web clip for the inspector and the web editor.
 * @param {any} clip
 * @param {number} fps
 * @param {RecordingProgress|null} [recording]
 * @returns {{ state: WebState|'', text: string, action: string }} `action`
 *   is what the record button says
 */
export function webClipStatus(clip, fps, recording) {
  const state = webState(clip, fps);
  if (!state) return { state, text: '', action: '' };
  const action = state === 'unrecorded' ? 'Record' : 'Record again';
  if (isRecording(recording)) {
    const percent = Math.round(recording.progress || 0);
    const text =
      recording.status === 'running' ? `Recording ${percent} %` : 'Starting the browser…';
    return { state: 'recording', text, action };
  }
  if (state === 'unrecorded') return { state, text: 'Not recorded', action };
  if (state === 'stale')
    return { state, text: 'Out of date — it shows an earlier version of the steps', action };
  const { width, height } = recordingSize(clip.web.recipe);
  const seconds = (Math.round(webDuration(clip, fps) * 10) / 10).toFixed(1);
  return { state, text: `Recorded ${seconds} s · ${width}×${height}`, action };
}

/**
 * The name a web clip goes by: the page's title once it is known, else the
 * host of its address.
 * @param {any} clip
 * @returns {string}
 */
export function webClipName(clip) {
  return clip?.web?.title || hostOf(clip?.web?.recipe?.url || '') || 'Web page';
}

/**
 * The web clips of a document that a render would not show as their steps
 * say: never recorded, or recorded from an earlier recipe.
 * @param {any} doc
 * @returns {{ unrecorded: string[], stale: string[], total: number, text: string }}
 *   Clip ids, and a sentence for the export dialog ('' when all are fine)
 */
export function webClipsToRecord(doc) {
  const fps = fpsOf(doc);
  /** @type {string[]} */
  const unrecorded = [];
  /** @type {string[]} */
  const stale = [];
  for (const { clip } of webClips(doc)) {
    const state = webState(clip, fps);
    if (state === 'unrecorded') unrecorded.push(clip.clipId);
    else if (state === 'stale') stale.push(clip.clipId);
  }
  const total = unrecorded.length + stale.length;
  const parts = [];
  if (unrecorded.length) parts.push(`${unrecorded.length} not recorded yet`);
  if (stale.length) parts.push(`${stale.length} out of date`);
  const noun = total === 1 ? 'web clip is' : 'web clips are';
  const text = total ? `${total} ${noun} not ready: ${parts.join(', ')}.` : '';
  return { unrecorded, stale, total, text };
}
