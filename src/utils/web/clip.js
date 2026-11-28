/**
 * What a clip's `web` block says about the clip: whether it is a web clip,
 * how long its recording is, whether the recording it points at is still
 * the one its recipe asks for, and where its steps fall. Documents are
 * never changed in place, so scores and keys are remembered per recipe
 * object. Isomorphic and pure.
 * @module utils/web/clip
 */

import { recipeKey } from './key.js';
import { compileScore, scoreFps } from './score.js';
import { stepLabel } from './stepLabel.js';

/** @typedef {import('./types.js').Score} Score */
/** @typedef {import('./types.js').WebBlock} WebBlock */
/** @typedef {{ web?: Partial<WebBlock> } | null | undefined} WebHolder - A clip, for what this module reads */

/** @type {WeakMap<object, Map<number, Score>>} */
const scores = new WeakMap();
/** @type {WeakMap<object, Map<number, string>>} */
const keys = new WeakMap();

/**
 * @template T
 * @param {WeakMap<object, Map<number, T>>} store
 * @param {object} recipe
 * @param {number} fps
 * @param {() => T} make
 * @returns {T} The value made for this recipe object and frame rate
 */
function remembered(store, recipe, fps, make) {
  let byRate = store.get(recipe);
  if (!byRate) store.set(recipe, (byRate = new Map()));
  if (!byRate.has(fps)) byRate.set(fps, make());
  return byRate.get(fps);
}

/**
 * @template T
 * @param {T} value
 * @returns {T} The value, frozen all the way down
 */
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(frozen);
  }
  return value;
}

/**
 * @param {WebHolder} clip
 * @returns {boolean} True for a clip whose `web.recipe` names a page
 */
export function isWebClip(clip) {
  const url = clip?.web?.recipe?.url;
  return typeof url === 'string' && url !== '';
}

/**
 * The score of a web clip at a frame rate.
 * @param {WebHolder} clip
 * @param {number} [fps=30]
 * @returns {Score|null} Frozen, shared between calls; null when the clip is
 *   not a web clip
 */
export function clipScore(clip, fps) {
  if (!isWebClip(clip)) return null;
  const { recipe } = clip.web;
  const rate = scoreFps(fps);
  return remembered(scores, recipe, rate, () => frozen(compileScore(recipe, rate)));
}

/**
 * How long a web clip's source is: its score — which is also exactly the
 * length of the recording that recipe makes at that frame rate. A web
 * clip's source window lies inside `0 … webDuration`.
 * @param {WebHolder} clip
 * @param {number} [fps=30]
 * @returns {number|undefined} Seconds; undefined when the clip is not a web clip
 */
export function webDuration(clip, fps) {
  return clipScore(clip, fps)?.duration;
}

/**
 * Whether a web clip needs recording: its `web.key` is not the key of its
 * recipe at this frame rate. That is so for a clip that was never recorded
 * (`key: ''`) and for one whose recipe, or whose document's frame rate, has
 * changed since. The old recording keeps playing until the new one is set.
 * @param {WebHolder} clip
 * @param {number} [fps=30]
 * @returns {boolean} False for a clip that is not a web clip
 */
export function isStale(clip, fps) {
  if (!isWebClip(clip)) return false;
  const { recipe, key } = clip.web;
  const rate = scoreFps(fps);
  return key !== remembered(keys, recipe, rate, () => recipeKey(recipe, rate));
}

/**
 * Where a web clip's steps begin, for ticks on the timeline. Times are in
 * the clip's own source time — seconds of the recording — so a tick is at
 * `timelineStart + (time − sourceIn)` and may fall outside a trimmed clip.
 * Made from the score, so it works before anything is recorded.
 * @param {WebHolder} clip
 * @param {number} [fps=30]
 * @returns {{ time: number, label: string, do: string, index: number }[]}
 *   One per step, in order; `index` is the step's place in the recipe
 */
export function stepMarks(clip, fps) {
  const score = clipScore(clip, fps);
  if (!score) return [];
  const { steps } = clip.web.recipe;
  return score.steps.map((at) => ({
    time: at.start,
    label: stepLabel(steps[at.index]),
    do: at.do,
    index: at.index,
  }));
}
