/**
 * The `web` field of a clip as data: reading it from a loaded document,
 * checking it, and fitting a clip's source window to its recording. A clip
 * has a `web` block only when it is (or is becoming) a web clip — every
 * other clip has no such field. Isomorphic and pure.
 * @module utils/web/field
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own, textOf } from './coerce.js';
import { KEY_PATTERN } from './key.js';
import { normalizeRecipe } from './normalize.js';

/** @typedef {import('./types.js').WebBlock} WebBlock */
/** @typedef {(path: string, message: string) => void} Report */

/** Longest page title kept, characters. */
export const MAX_TITLE = 300;

/** Float tolerance, seconds, when a window is compared with its source. */
const SLACK = 1e-6;

/**
 * Read a `web` block. The recipe is normalised — which also bounds it: only
 * known fields of plain objects are read, every string and list is cut to
 * its limit — `key` is kept when it looks like one, `title` is cut.
 * @param {any} raw
 * @returns {WebBlock|null} null for anything without a recipe object
 */
export function cleanWeb(raw) {
  if (!isPlainObject(raw) || !isPlainObject(own(raw, 'recipe'))) return null;
  const key = own(raw, 'key');
  return {
    recipe: normalizeRecipe(own(raw, 'recipe')),
    key: typeof key === 'string' && KEY_PATTERN.test(key) ? key : '',
    title: textOf(own(raw, 'title'), MAX_TITLE),
  };
}

/**
 * @param {any} a
 * @param {any} b
 * @param {string} path
 * @returns {string|null} Path of the first place two JSON values differ, or null
 */
function firstDifference(a, b, path) {
  if (a === b) return null;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b) return path;
  if (typeof a !== 'object' || !a || !b) return path;
  if (!Array.isArray(a) && !(isPlainObject(a) && isPlainObject(b))) return path;
  const keys = Object.keys(a);
  const extra = Object.keys(b).find((key) => !Object.hasOwn(a, key));
  if (extra !== undefined) return Array.isArray(b) ? `${path}[${extra}]` : `${path}.${extra}`;
  for (const key of keys) {
    const at = Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`;
    const found = Object.hasOwn(b, key) ? firstDifference(a[key], b[key], at) : at;
    if (found !== null) return found;
  }
  return null;
}

/**
 * Check a clip's `web` field for `validateEdl`: absent, or exactly what
 * `cleanWeb` produces — a normalised recipe, a key or '', a bounded title.
 * Whether the recipe can be recorded (an address, steps with their targets)
 * is not a matter of the document's validity: a recipe is saved while it
 * is being written. `validateRecipe` answers that.
 * @param {any} web
 * @param {string} path - Path of the field, e.g. `tracks[0].clips[2].web`
 * @param {Report} report
 */
export function checkWeb(web, path, report) {
  if (web === undefined) return;
  if (!isPlainObject(web)) return report(path, 'must be an object');
  const unknown = Object.keys(web).find((key) => !['recipe', 'key', 'title'].includes(key));
  if (unknown !== undefined) report(`${path}.${unknown}`, 'is not a field of a web clip');
  if (typeof web.key !== 'string' || (web.key !== '' && !KEY_PATTERN.test(web.key))) {
    report(`${path}.key`, "must be '' or the 20 hex digits of a recording's key");
  }
  if (typeof web.title !== 'string' || web.title.length > MAX_TITLE) {
    report(`${path}.title`, `must be a string of at most ${MAX_TITLE} characters`);
  }
  if (!isPlainObject(web.recipe)) return report(`${path}.recipe`, 'must be an object');
  const at = firstDifference(web.recipe, normalizeRecipe(web.recipe), `${path}.recipe`);
  if (at !== null) report(at, 'is not what a normalised recipe holds (see normalizeRecipe)');
}

/**
 * Fit a source window into a source `0 … limit` long: it starts at 0 or
 * later, ends at `limit` or earlier, and keeps at least one frame.
 * @param {number} sourceIn
 * @param {number} length - Seconds the clip lasts
 * @param {number} limit - Length of the source, at least one frame
 * @param {number} fps
 * @returns {{ sourceIn: number, length: number }} The same numbers when
 *   the window already fits; a shortened length is a whole number of frames
 */
export function fitWindow(sourceIn, length, limit, fps) {
  const frame = 1 / fps;
  const latest = Math.max(0, limit - frame);
  // A microsecond of slack: a window that fits is returned exactly as it is.
  const from = sourceIn > latest + SLACK ? latest : Math.max(0, sourceIn);
  const room = Math.max(frame, Math.floor((limit - from) * fps + SLACK) / fps);
  return { sourceIn: from, length: Math.max(frame, length > room + SLACK ? room : length) };
}

/**
 * Give a clip a new source length. A clip that showed the whole of its old
 * source shows the whole of the new one — its length follows; otherwise
 * its window is only brought inside the new source.
 * @param {{ sourceIn: number, sourceOut: number, timelineStart: number,
 *   timelineEnd: number }} clip
 * @param {number} from - Length of the source the window was cut from; NaN
 *   when there was none
 * @param {number} to - Length of the new source
 * @param {number} fps
 * @returns {{ sourceIn: number, sourceOut: number, timelineEnd: number }}
 */
export function refitWindow(clip, from, to, fps) {
  const slack = 0.5 / fps;
  const whole = Math.abs(clip.sourceIn) <= slack && Math.abs(clip.sourceOut - from) <= slack;
  const length = whole ? to : clip.timelineEnd - clip.timelineStart;
  const fitted = fitWindow(whole ? 0 : clip.sourceIn, length, to, fps);
  const timelineEnd = Math.round((clip.timelineStart + fitted.length) * fps) / fps;
  const sourceOut = fitted.sourceIn + (timelineEnd - clip.timelineStart);
  return { sourceIn: fitted.sourceIn, sourceOut, timelineEnd };
}
