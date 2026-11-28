/**
 * Writing plain (not keyframed) values into one clip: the merge behind
 * `updateClip`, and writing a single property by path. Isomorphic and pure.
 * @module utils/edl/clipPatch
 */

import { tidyKeyframes } from './clipPaths.js';
import { isTimed } from './immutable.js';
import { isPlainObject, isSafeKey, mergeBag } from './jsonBag.js';
import { mergeShape } from './sanitize.js';
import { hasMadeSource } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */

/** Fields a patch never writes: they belong to move/trim/slip/fade/link/group. */
const STRUCTURAL = ['clipId', 'timelineStart', 'timelineEnd', 'sourceOut', 'fadeIn', 'fadeOut'];
const RELATIONS = ['linkedClipId', 'groupId'];
/**
 * The description a clip's source is made from: written by webClip.js,
 * musicClip.js and elementClip.js only.
 */
const DESCRIPTIONS = ['web', 'music', 'element'];
/**
 * A clip's captions are switched and written by captions.js only, its
 * cutout by cutout.js, its credit by credit.js (`setCredit`).
 */
const SPOKEN = ['captions', 'cutout', 'credit'];
/** A web or music clip's recording and its window belong to those operations too. */
const RECORDED = ['sourceFile', 'sourceIn'];

/**
 * Deep-merge a patch into a clip (the rules are those of `updateClip`).
 * @param {Clip} clip
 * @param {Track} track - The track that holds it
 * @param {any} patch
 * @param {Record<string, string[]>} [enums] - The enumerations in force:
 *   `fontEnums(edl.fonts)` lets a title name a font of the document's own
 * @returns {Clip} The clip itself when nothing changed
 */
export function patchClip(clip, track, patch, enums) {
  if (!patch || typeof patch !== 'object') return clip;
  const safe = { ...patch };
  for (const key of [...STRUCTURAL, ...RELATIONS, ...DESCRIPTIONS, ...SPOKEN]) delete safe[key];
  for (const key of hasMadeSource(clip) ? RECORDED : []) delete safe[key];
  /** @type {any} */
  const merged = tidyKeyframes(/** @type {any} */ (mergeShape(clip, safe, enums)));
  if (merged === clip) return clip;
  // Real media cannot start before its first frame; any other source can.
  const sourceIn = isTimed(merged, track) ? Math.max(0, merged.sourceIn) : merged.sourceIn;
  const replaced = merged.sourceFile !== clip.sourceFile;
  if (sourceIn === clip.sourceIn && !replaced) return merged;
  // A credit is for the file the clip played: another file does not inherit it.
  const { credit, ...rest } = merged;
  const next = replaced && credit ? rest : merged;
  return { ...next, sourceIn, sourceOut: sourceIn + (merged.timelineEnd - merged.timelineStart) };
}

/**
 * The patch that sets one, possibly nested, parameter of a bag without
 * losing its siblings: `(['center', 'x'], 0.3)` → `{ center: { …, x: 0.3 } }`.
 * @param {Record<string, any>} params
 * @param {string[]} keys - Path inside the bag
 * @param {any} value - `null` removes a top-level parameter
 * @returns {Record<string, any>}
 */
function bagPatch(params, keys, value) {
  /** @type {(node: any, depth: number) => Record<string, any>} */
  const assign = (node, depth) => {
    const base = isPlainObject(node) ? node : {};
    const last = depth === keys.length - 1;
    return { ...base, [keys[depth]]: last ? value : assign(base[keys[depth]], depth + 1) };
  };
  return { [keys[0]]: assign(params, 0)[keys[0]] };
}

/**
 * Write one plain value by path. Schema fields (`transform.x`, `text.color`,
 * `volume`, `label`…) are coerced and clamped like any patch; generator and
 * effect parameters (`generator.params.<name>`, `effects.<id>.<param>`)
 * take any JSON-safe value, and `null` removes the parameter so that its
 * catalog default applies again.
 * @param {Clip} clip
 * @param {Track} track
 * @param {string} path
 * @param {any} value
 * @param {Record<string, string[]>} [enums] - As for `patchClip`
 * @returns {Clip} The clip itself when the path cannot be written or the
 *   value changes nothing
 */
export function writeValue(clip, track, path, value, enums) {
  const parts = typeof path === 'string' ? path.split('.') : [];
  if (!parts.length || !parts.every(isSafeKey)) return clip;
  if (parts[0] === 'effects') {
    const effect = parts.length >= 3 && clip.effects.find((fx) => fx.effectId === parts[1]);
    if (!effect) return clip;
    const params = mergeBag(effect.params, bagPatch(effect.params, parts.slice(2), value));
    if (params === effect.params) return clip;
    const effects = clip.effects.map((fx) => (fx === effect ? { ...fx, params } : fx));
    return { ...clip, effects };
  }
  if (parts[0] === 'generator' && parts[1] === 'params') {
    if (parts.length < 3) return clip;
    const before = clip.generator.params;
    const params = mergeBag(before, bagPatch(before, parts.slice(2), value));
    return params === before ? clip : { ...clip, generator: { ...clip.generator, params } };
  }
  return patchClip(
    clip,
    track,
    parts.reduceRight((inner, key) => ({ [key]: inner }), value),
    enums,
  );
}
