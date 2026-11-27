/**
 * A small authoring kit over the document operations: add a generator or a
 * title, give it effects and keyframes, and get its id back to refer to.
 * Everything goes through the same operations the editor uses.
 */

import {
  addEffect,
  insertGenerator,
  insertTitle,
  setKeyframe,
  updateClip,
} from '#utils/edl/index.js';
import { GENERATORS } from '#utils/compose/index.js';

/** @param {string} id - A particle preset id */
export function particlePreset(id) {
  const presets = GENERATORS.find((g) => g.type === 'particles')?.presets || [];
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error(`No particle preset "${id}"`);
  return preset;
}

/**
 * @param {import('#utils/edl/types.js').Edl} start
 */
export function stage(start) {
  let doc = start;
  const ids = () => new Set(doc.tracks.flatMap((t) => t.clips.map((c) => c.clipId)));
  const added = (/** @type {Set<string>} */ before) => {
    const id = [...ids()].find((each) => !before.has(each));
    if (!id) throw new Error('The clip was not added (does it overlap one on its track?)');
    return id;
  };
  let seed = 100;
  return {
    doc: () => doc,
    /** A generator clip on a track over [from, to]. */
    generator(trackId, [from, to], type, params = {}, clip = {}) {
      const before = ids();
      const opts = {
        time: from,
        duration: to - from,
        trackId,
        clip,
        autoCrossfade: false,
      };
      doc = insertGenerator(doc, { type, params, seed: (seed += 7) }, opts);
      return added(before);
    },
    /** A particle preset on a track, with its blend mode. */
    particles(trackId, span, presetId, params = {}, clip = {}) {
      const preset = particlePreset(presetId);
      const merged = { ...preset.params, ...params };
      const look = {
        ...(preset.blendMode ? { blendMode: preset.blendMode } : {}),
        ...clip,
      };
      return this.generator(trackId, span, 'particles', merged, look);
    },
    /** A title on a track over [from, to]; `text` is a text block. */
    title(trackId, [from, to], text) {
      const before = ids();
      doc = insertTitle(doc, {
        text,
        time: from,
        duration: to - from,
        trackId,
      });
      return added(before);
    },
    /** Change a clip: transform, fades, blend mode… */
    patch(clipId, patch) {
      doc = updateClip(doc, clipId, patch);
    },
    /** Add an effect to a clip; returns the path prefix its keyframes use. */
    effect(clipId, type, params = {}) {
      const effectId = `${type}_${(seed += 1)}`;
      doc = addEffect(doc, { clipId }, type, { params, effectId });
      return `effects.${effectId}`;
    },
    /** Keyframes on one property: [[time, value, ease?], …] in timeline seconds. */
    keys(clipId, path, keys) {
      for (const [time, value, ease = 'linear'] of keys) {
        const next = setKeyframe(doc, clipId, path, time, value, { ease });
        if (next === doc) throw new Error(`Cannot key ${path} at ${time}`);
        doc = next;
      }
    },
  };
}
