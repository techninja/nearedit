/**
 * Generator clips — synthetic sources drawn by the compositor (solid,
 * gradient, particles…). A generator is a clip whose `generator.type`
 * names an entry of the catalog (src/utils/compose/catalog.js); this
 * library stores the type, the seed and the parameters without knowing
 * what they mean. Isomorphic and pure.
 * @module utils/edl/generator
 */

import { patchClip } from './clipPatch.js';
import { tidyKeyframes } from './clipPaths.js';
import { isTypeName } from './effectList.js';
import { createClip } from './factory.js';
import { changeClip } from './immutable.js';
import { cleanBag, mergeBag } from './jsonBag.js';
import { addOverlay, overlaySpan } from './overlayClip.js';
import { coerce } from './sanitize.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Add a generator clip. It is placed like a title: on the front-most video
 * track when that is free in its time span, otherwise on a new video track
 * on top; with an explicit `trackId` it goes there under the normal
 * overlap rules. Its source window starts at 0, so keyframe times and the
 * generator's own motion count from the clip's start.
 * @param {Edl} edl
 * @param {{ type: string, params?: Record<string, any>, seed?: number }} generator -
 *   Missing parameters take their catalog defaults; a missing `seed` is
 *   drawn at random so two inserts do not look alike
 * @param {{ time?: number, duration?: number, trackId?: string, label?: string,
 *   autoCrossfade?: boolean, clip?: Record<string, any> }} [opts] - `time`
 *   default 0, `duration` default 5 s. `clip` is merged into the new clip
 *   like an `updateClip` patch: `blendMode`, `transform`, `effects`,
 *   `keyframes`, `fadeInCurve`…
 * @returns {Edl} Unchanged when there is no generator type
 */
export function insertGenerator(edl, generator, opts = {}) {
  if (!isTypeName(generator?.type)) return edl;
  const seed = coerce('seed', generator.seed, Math.floor(Math.random() * 1e6));
  const label = typeof opts.label === 'string' ? opts.label : generator.type;
  const span = overlaySpan(edl, opts.time, opts.duration);
  const plain = createClip({
    ...span,
    label,
    generator: { type: generator.type, seed, params: cleanBag(generator.params) },
  });
  const clip = patchClip(plain, /** @type {any} */ ({ type: 'video' }), opts.clip);
  return addOverlay(edl, { ...clip, ...span }, opts);
}

/**
 * Change a clip's generator: merge `params` key by key (a `null` removes a
 * parameter, so its catalog default applies again), set the `seed`, or
 * switch the `type`. Switching the type starts from that generator's
 * defaults — the old parameters and their keyframes are dropped, only the
 * `params` given with the switch are kept. An empty `type` turns the clip
 * back into a title or placeholder.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ type?: string, seed?: number, params?: Record<string, any> }} patch
 * @returns {Edl}
 */
export function updateGenerator(edl, clipId, patch) {
  return changeClip(edl, clipId, (clip) => {
    const now = clip.generator;
    const type = patch?.type === '' || isTypeName(patch?.type) ? patch.type : now.type;
    const retyped = type !== now.type;
    const params = mergeBag(retyped ? {} : now.params, patch?.params);
    const seed = coerce('seed', patch?.seed, now.seed);
    if (!retyped && params === now.params && seed === now.seed) return clip;
    const keyframes = Object.fromEntries(
      Object.entries(clip.keyframes).filter(([path]) => !path.startsWith('generator.params.')),
    );
    const kept = retyped ? keyframes : clip.keyframes;
    return tidyKeyframes({ ...clip, keyframes: kept, generator: { type, seed, params } });
  });
}
