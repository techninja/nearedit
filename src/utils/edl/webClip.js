/**
 * Web clips — clips whose picture is a scripted recording of a web page
 * (docs/app-spec/WEBCLIP.md). A web clip carries `web: { recipe, key,
 * title }`: the recipe is the source of truth, `key` names the recording
 * `sourceFile` points at. Until it is recorded it is a placeholder as long
 * as its score; recorded, it is a video clip like any other. Its source is
 * its score, so its window always lies inside `0 … webDuration`.
 * Isomorphic and pure.
 * @module utils/edl/webClip
 */

import { isStale, isWebClip, webDuration } from '#utils/web/clip.js';
import { hostOf } from '#utils/web/coerce.js';
import { MAX_TITLE, refitWindow } from '#utils/web/field.js';
import { KEY_PATTERN } from '#utils/web/key.js';
import { normalizeRecipe } from '#utils/web/normalize.js';
import { reuseClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { createClip } from './factory.js';
import { indexClips, mapClips } from './immutable.js';
import { sameJson } from './jsonBag.js';
import { addOverlay, overlaySpan } from './overlayClip.js';
import { allClips } from './query.js';
import { fpsOf, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * Add a web clip: a placeholder as long as the recipe's score, carrying the
 * recipe, not recorded yet. It is placed like a title or a generator — on
 * the front-most video track when that is free in its time span, otherwise
 * on a new video track on top; with an explicit `trackId` it goes there
 * under the normal overlap rules. Find it with `newClipIds(before, after)`.
 * @param {Edl} edl
 * @param {any} recipe - Normalised here
 * @param {{ time?: number, trackId?: string, autoCrossfade?: boolean, label?: string }} [opts] -
 *   `time` default 0; `label` default: the host of the recipe's address
 * @returns {Edl} Unchanged when the recipe has no `http(s)` address
 */
export function insertWebClip(edl, recipe, opts = {}) {
  const web = { recipe: normalizeRecipe(recipe), key: '', title: '' };
  if (!isWebClip({ web })) return edl;
  const label = typeof opts.label === 'string' ? opts.label : hostOf(web.recipe.url);
  const span = overlaySpan(edl, opts.time, webDuration({ web }, fpsOf(edl)));
  return addOverlay(edl, createClip({ ...span, label, placeholder: true, web }), opts);
}

/**
 * Rewrite one clip that has a `web` block, then settle its track: a clip
 * that grew over its neighbour cross-fades with it or overwrites it, as a
 * trimmed one would.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ autoCrossfade?: boolean }} opts
 * @param {(clip: Clip) => Clip} change - Returns a clip that is the same
 *   in every field to change nothing
 * @returns {Edl} Unchanged for an unknown clip, a clip on a locked track
 *   and a clip without a `web` block
 */
function changeWebClip(edl, clipId, opts, change) {
  const ref = indexClips(edl).get(clipId);
  if (!ref || ref.track.locked || !ref.clip.web) return edl;
  const next = reuseClip(ref.clip, change(ref.clip));
  if (next === ref.clip) return edl;
  const raw = mapClips(edl, (clip) => (clip === ref.clip ? next : clip));
  return settle(edl, raw, { incoming: [clipId], autoCrossfade: opts?.autoCrossfade });
}

/**
 * Replace a web clip's recipe. A clip that showed the whole of its old
 * score shows the whole of the new one: its length follows. One that was
 * trimmed keeps its window, brought inside the new score. `sourceFile` and
 * `web.key` stay as they are — the old recording keeps playing and the
 * clip is stale (`isStale`) until `setWebRecording` brings the new one.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {any} recipe - The whole new recipe, or a function from the
 *   current recipe to the new one; normalised here
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} Unchanged when the recipe says what the old one said
 */
export function updateWebRecipe(edl, clipId, recipe, opts = {}) {
  const fps = fpsOf(edl);
  return changeWebClip(edl, clipId, opts, (clip) => {
    const given = typeof recipe === 'function' ? recipe(clip.web.recipe) : recipe;
    const web = { ...clip.web, recipe: normalizeRecipe(given) };
    if (sameJson(web.recipe, clip.web.recipe)) return clip;
    const length = webDuration({ web }, fps);
    // Without an address there is no score to follow: the timing waits.
    if (length === undefined) return { ...clip, web };
    return { ...clip, web, ...refitWindow(clip, webDuration(clip, fps) ?? NaN, length, fps) };
  });
}

/**
 * Point a web clip at a finished recording: sets `sourceFile`, `web.key`
 * and `web.title`, and the clip stops being a placeholder. When the
 * recording is the one the clip's recipe asks for, the window is fitted to
 * its `duration` as `updateWebRecipe` fits it to a score. A recording of an
 * earlier recipe (the recipe changed while it was being made) is shown as
 * it is: the clip keeps the length of its current score and stays stale.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ file: string, key: string, duration: number, title?: string }} recording -
 *   The result of a `web` job (API.md)
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} Unchanged without a file, a key and a duration, and for a
 *   clip that is not a web clip
 */
export function setWebRecording(edl, clipId, recording, opts = {}) {
  const { file, key, duration, title } = recording || {};
  const named = typeof file === 'string' && file !== '' && KEY_PATTERN.test(key);
  if (!named || !Number.isFinite(duration) || !(duration > 0)) return edl;
  const fps = fpsOf(edl);
  return changeWebClip(edl, clipId, opts, (clip) => {
    // A recipe without an address has no recording.
    if (!isWebClip(clip)) return clip;
    const shown = typeof title === 'string' ? title.slice(0, MAX_TITLE) : clip.web.title;
    const changed = key !== clip.web.key || shown !== clip.web.title;
    const web = changed ? { ...clip.web, key, title: shown } : clip.web;
    const score = webDuration(clip, fps);
    const fresh = !isStale({ web }, fps);
    // A container may report its length a hair off the frame grid.
    const length = Math.min(snap(edl, duration), score);
    const window = fresh ? refitWindow(clip, score, length, fps) : {};
    return { ...clip, sourceFile: file, placeholder: false, web, ...window };
  });
}

/**
 * @param {Edl} edl
 * @returns {ClipRef[]} Every web clip with its track, in track then time order
 */
export function webClips(edl) {
  return allClips(edl).filter(({ clip }) => isWebClip(clip));
}

/**
 * @param {Edl} edl
 * @returns {ClipRef[]} The web clips that need recording at the document's
 *   frame rate: never recorded, or recorded from another recipe
 */
export function staleWebClips(edl) {
  return webClips(edl).filter(({ clip }) => isStale(clip, fpsOf(edl)));
}
