/**
 * The person cutout as edits: switching it on for clips and changing its
 * settings, attaching the cutout file a finished job made, and saying what
 * a timeline still needs made. A clip keeps `cutout: { on, mode, feather,
 * shrink, blur, made? }` — `made` is the cutout file it remembers — and
 * clips that play the same media file share one cutout.
 * Isomorphic and pure. Contract: docs/app-spec/CUTOUT.md § In the document.
 * @module utils/edl/cutout
 */

import { coerceParam } from '#utils/compose/params.js';
import {
  CUTOUT_FIELDS,
  cleanCutout,
  cleanMade,
  coversClip,
  cutoutOf,
  cutoutRanges,
  cutoutState,
  isCutoutClip,
  normalizeCutout,
} from '#utils/cutout/index.js';
import { clipKind } from './clipKind.js';
import { idList, indexClips, mapClips } from './immutable.js';
import { isPlainObject, sameJson } from './jsonBag.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('#utils/cutout/types.js').CutoutMade} CutoutMade */

/**
 * Whether a clip can be cut out: it plays a video file on a video track. A
 * still, a title, a generator, an element and sound cannot.
 * @param {Clip} clip
 * @param {Track} [track]
 * @returns {boolean}
 */
export function canCutout(clip, track) {
  return Boolean(clip?.sourceFile) && clipKind(clip, track) === 'video';
}

/**
 * A clip with its `cutout` block replaced, or without one when the block
 * says nothing (off, every setting at its default, nothing made).
 * @param {Clip} clip
 * @param {any} block
 * @returns {Clip} The clip itself when it already holds exactly that
 */
function withBlock(clip, block) {
  const next = cleanCutout(block);
  if (next ? sameJson(next, clip.cutout) : clip.cutout === undefined) return clip;
  if (next) return { ...clip, cutout: next };
  const rest = { ...clip };
  delete rest.cutout;
  return rest;
}

/**
 * Switch the cutout of clips on or off and change its settings — one step
 * for any number of clips. Switching off keeps the settings and the cutout
 * that was made, so switching on again shows it at once.
 * @param {Edl} edl
 * @param {Iterable<string>|string} clipIds - Clips that cannot be cut out
 *   (`canCutout`) and clips on locked tracks are left alone
 * @param {boolean|Partial<import('#utils/cutout/types.js').CutoutBlock>} [patch] -
 *   Any of `on`, `mode`, `feather`, `shrink`, `blur`; `true` / `false` is
 *   short for `{ on }`. A value that cannot be used leaves its setting as it
 *   is; `made` is written by `attachCutout` only
 * @returns {Edl} The same document when nothing changed
 */
export function setCutout(edl, clipIds, patch = true) {
  const ids = new Set(idList(clipIds));
  const asked = typeof patch === 'boolean' ? { on: patch } : patch;
  if (!ids.size || !isPlainObject(asked)) return edl;
  return mapClips(edl, (clip, track) => {
    if (!ids.has(clip.clipId) || !canCutout(clip, track)) return clip;
    /** @type {Record<string, any>} */
    const block = normalizeCutout(clip.cutout);
    for (const [name, spec] of Object.entries(CUTOUT_FIELDS)) {
      if (!Object.hasOwn(asked, name)) continue;
      block[name] = coerceParam({ ...spec, default: block[name] }, asked[name]);
    }
    return withBlock(clip, { ...block, made: clip.cutout?.made });
  });
}

/**
 * How much of a clip's source window a cutout holds, seconds.
 * @param {CutoutMade|null} made
 * @param {Clip} clip
 * @returns {number}
 */
function held(made, clip) {
  if (!made) return 0;
  return Math.max(0, Math.min(made.end, clip.sourceOut) - Math.max(made.start, clip.sourceIn));
}

/**
 * Attach a finished cutout to the clips it is for: every clip with cutout
 * on that plays the media file it was cut out of and whose source window
 * it covers — clips of one file share one cutout, and the newest one made
 * wins. A clip it does not cover whole (it was trimmed longer while the
 * job ran) takes it when it holds more of the clip than what the clip has:
 * the covered part plays while the rest is made. Clips on locked tracks
 * get it too — nothing a person made is changed by it. Not an undo step of
 * its own: commit it with `{ record: false }`.
 * @param {Edl} edl
 * @param {any} made - The result of a `cutout` job: `{ file, key, source,
 *   start, end, fps, width, height, frames }`, `source` being the media
 *   file (`cleanMade`)
 * @returns {Edl} The same document when the result is not usable or no
 *   clip takes it
 */
export function attachCutout(edl, made) {
  const result = cleanMade(made);
  if (!result) return edl;
  const attach = (/** @type {Clip} */ clip, /** @type {Track} */ track) => {
    if (!isCutoutClip(clip, track) || clip.sourceFile !== result.source) return clip;
    const has = cutoutOf(clip);
    if (has && sameJson(has, result)) return clip;
    const better = coversClip(result, clip) || held(result, clip) > held(has, clip);
    return better ? withBlock(clip, { ...clip.cutout, made: result }) : clip;
  };
  return mapClips(edl, attach, true);
}

/**
 * What a timeline still needs cut out — what to ask the server for: the
 * stretches of `cutoutRanges(edl)` in which a clip is not drawn through its
 * matte yet, because nothing was made for it or because what was made no
 * longer covers it (or was made at another frame rate).
 * @param {Edl} edl
 * @returns {(import('#utils/cutout/types.js').CutoutRange & { waiting: string[] })[]}
 *   One per media file: `{ path, start, end, fps, frames, clips, waiting }`
 *   — `clips` are all the clips the cutout is for, `waiting` those of them
 *   that are not ready
 */
export function cutoutNeeds(edl) {
  const index = indexClips(edl);
  return cutoutRanges(edl).flatMap((range) => {
    const waiting = range.clips.filter(
      (id) => cutoutState(index.get(id)?.clip, edl.fps) !== 'ready',
    );
    return waiting.length ? [{ ...range, waiting }] : [];
  });
}
