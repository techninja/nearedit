/**
 * The recording flow, the part that needs no network: what to ask the
 * server for a clip, and what a finished recording means for the document.
 * A recording is attached only where the recipe still asks for exactly it
 * (its key is the key of the clip's recipe now): a clip that was deleted, a
 * clip on a track that got locked, and a clip whose recipe changed while
 * the browser was recording are left as they are. Pure and isomorphic.
 * @module utils/webUi/recordingApply
 */

import { findClip } from '#utils/edl/query.js';
import { fpsOf } from '#utils/edl/time.js';
import { setWebRecording, webClips } from '#utils/edl/webClip.js';
import { isStale, isWebClip, validateRecipe } from '#utils/web/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} RecordingResult - The result of a `web` job
 * @property {string} file
 * @property {string} key
 * @property {number} duration
 * @property {number} [fps]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [title]
 * @property {any} [track]
 * @property {boolean} [cached]
 */

/** @typedef {'attached'|'gone'|'locked'|'outdated'} Outcome */

/** What each outcome means, for the person who pressed Record. */
export const OUTCOME_TEXT = {
  attached: 'Recorded',
  gone: 'The clip was deleted while it was being recorded',
  locked: 'The clip’s track was locked while it was being recorded — unlock it and record again',
  outdated: 'The steps changed while it was being recorded — record again',
};

/**
 * What to send to `POST /api/web/record` for a clip.
 * @param {Edl} doc
 * @param {string} clipId
 * @param {string} projectId
 * @returns {{ body: { projectId: string, recipe: any, fps: number }|null, problem: string }}
 *   `body` is null when the clip cannot be recorded, and `problem` says why
 */
export function recordRequest(doc, clipId, projectId) {
  const found = findClip(doc, clipId);
  if (!found || !isWebClip(found.clip))
    return { body: null, problem: 'This is not a web clip any more' };
  if (found.track.locked) return { body: null, problem: 'The clip is on a locked track' };
  const { recipe } = found.clip.web;
  const [first] = validateRecipe(recipe).problems;
  if (first) {
    const at = /^steps\[(\d+)\]/.exec(first.path);
    const where = at ? `Step ${Number(at[1]) + 1}: ` : '';
    return { body: null, problem: `${where}${first.message}` };
  }
  return { body: { projectId, recipe, fps: fpsOf(doc) }, problem: '' };
}

/**
 * @param {Edl} doc
 * @param {any} clip
 * @param {RecordingResult} result
 * @returns {boolean} True when the clip's recipe asks for exactly this recording
 */
function asksFor(doc, clip, result) {
  return !isStale({ web: { ...clip.web, key: result.key } }, fpsOf(doc));
}

/**
 * What a finished recording means for the clip it was made for.
 * @param {Edl} doc - As it is now
 * @param {string} clipId
 * @param {RecordingResult} result
 * @returns {Outcome}
 */
export function recordingOutcome(doc, clipId, result) {
  const found = findClip(doc, clipId);
  if (!found || !isWebClip(found.clip)) return 'gone';
  if (found.track.locked) return 'locked';
  return asksFor(doc, found.clip, result) ? 'attached' : 'outdated';
}

/**
 * Attach a finished recording to every clip that is waiting for it: web
 * clips on unlocked tracks that need recording and whose recipe has this
 * recording's key. (Two clips with one recipe share one recording.)
 * @param {Edl} doc
 * @param {RecordingResult} result
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {{ doc: Edl, clipIds: string[] }} The same document when no clip took it
 */
export function attachRecording(doc, result, opts = {}) {
  const fps = fpsOf(doc);
  let next = doc;
  /** @type {string[]} */
  const clipIds = [];
  for (const { clip, track } of webClips(doc)) {
    if (track.locked || !isStale(clip, fps) || !asksFor(doc, clip, result)) continue;
    const after = setWebRecording(next, clip.clipId, /** @type {any} */ (result), opts);
    if (after === next) continue;
    next = after;
    clipIds.push(clip.clipId);
  }
  return { doc: next, clipIds };
}
