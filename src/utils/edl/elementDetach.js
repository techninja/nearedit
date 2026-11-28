/**
 * Detaching an element clip: its design expanded into the ordinary clips
 * that draw it — titles, shapes, pictures — put on tracks and grouped, and
 * the tie to the kit ended. Isomorphic and pure.
 * @module utils/edl/elementDetach
 */

import { elementSpan, isElementClip } from '#utils/brand/clip.js';
import { expandElement } from '#utils/brand/element/expand.js';
import { intersects } from './clipMath.js';
import { fitFades } from './fades.js';
import { newId, parseResolution } from './factory.js';
import { indexClips, mapClips, tracksOfType } from './immutable.js';
import { addClips } from './placement.js';
import { EPS, snap } from './time.js';
import { addTrack, moveTrack } from './trackOps.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

const NO_MOTION = { type: 'none', duration: 0, by: 'block', stagger: 0, ease: 'linear' };

/**
 * One expanded layer as a clip of the timeline: moved to where the element
 * plays, cut to the element clip's own span (an edge that is cut loses its
 * fade and its text animation, as a split does), and given the clip's
 * position, size and opacity.
 * @param {Edl} edl
 * @param {any} layer - A clip of the expansion: times from the run's start
 * @param {number} origin - Where the run starts on the timeline
 * @param {Clip} clip - The element clip
 * @param {string} groupId
 * @returns {Clip|null} null when nothing of the layer falls inside the clip
 */
function onTimeline(edl, layer, origin, clip, groupId) {
  const [from, to] = [origin + layer.timelineStart, origin + layer.timelineEnd];
  const start = snap(edl, Math.max(from, clip.timelineStart));
  const end = snap(edl, Math.min(to, clip.timelineEnd));
  if (!(end - start > EPS)) return null;
  const [cutIn, cutOut] = [start - from > 0.5 / edl.fps, to - end > 0.5 / edl.fps];
  const [fadeIn, fadeOut] = fitFades(
    cutIn ? 0 : layer.fadeIn,
    cutOut ? 0 : layer.fadeOut,
    end - start,
    false,
    false,
  );
  const sourceIn = layer.sourceIn + (start - from);
  const { x, y, scaleX, scaleY, opacity } = clip.transform;
  /** @type {(path: string, change: (v: number) => number) => any[]|undefined} */
  const keys = (path, change) =>
    layer.keyframes[path]?.map((key) => ({ ...key, v: change(key.v) }));
  const moved = {
    'transform.x': keys('transform.x', (v) => v * scaleX + x),
    'transform.y': keys('transform.y', (v) => v * scaleY + y),
    'transform.scaleX': keys('transform.scaleX', (v) => v * scaleX),
    'transform.scaleY': keys('transform.scaleY', (v) => v * scaleY),
  };
  const keyframes = { ...layer.keyframes };
  for (const [path, list] of Object.entries(moved)) if (list) keyframes[path] = list;
  return {
    ...layer,
    clipId: newId('clip'),
    groupId,
    ...{ timelineStart: start, timelineEnd: end, sourceIn, sourceOut: sourceIn + (end - start) },
    ...{ fadeIn, fadeOut, keyframes },
    text: {
      ...layer.text,
      ...(cutIn && { animateIn: NO_MOTION }),
      ...(cutOut && { animateOut: NO_MOTION }),
    },
    transform: {
      ...layer.transform,
      x: layer.transform.x * scaleX + x,
      y: layer.transform.y * scaleY + y,
      scaleX: layer.transform.scaleX * scaleX,
      scaleY: layer.transform.scaleY * scaleY,
      opacity: layer.transform.opacity * opacity,
    },
  };
}

/**
 * Turn an element clip into the ordinary clips that draw it, ending its tie
 * to the kit. The back-most layer takes the clip's place on its track; the
 * others go on the free tracks directly above it, and on new tracks put
 * there when those run out — so what was in front of the element stays in
 * front. The clips are one group. They carry the clip's position, size and
 * opacity; its own fades, effects, blend mode, rotation, crop and keyframes
 * are not carried over. Text is laid out with `measure` when a host gives
 * one (`expandElement`), otherwise by estimate.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ measure?: import('#utils/brand/types.js').ExpandOptions['measure'],
 *   sizeOf?: import('#utils/brand/types.js').ExpandOptions['sizeOf'] }} [opts]
 * @returns {Edl} Unchanged for a clip that is not an element clip, a clip
 *   on a locked track and a design that draws nothing
 */
export function detachElement(edl, clipId, opts = {}) {
  const ref = indexClips(edl).get(clipId);
  if (!ref || ref.track.locked || !isElementClip(ref.clip)) return edl;
  const { clip } = ref;
  const span = elementSpan(ref.track, clip);
  const expanded = expandElement(clip.element.design, clip.element.slots, {
    ...{ duration: span.end - span.start, frame: parseResolution(edl.resolution) },
    ...{ measure: opts.measure, sizeOf: opts.sizeOf, fonts: edl.fonts },
  });
  const groupId = newId('grp');
  const pieces = expanded
    .map((layer) => onTimeline(edl, layer, span.start, clip, groupId))
    .filter(Boolean);
  if (!pieces.length) return edl;
  let doc = mapClips(edl, (one) => (one.clipId === clipId ? null : one));
  /** @type {{ trackId: string, clip: Clip }[]} */
  const items = [];
  let below = ref.track.trackId;
  pieces.forEach((piece, i) => {
    // Neighbours in the stack that never show together share a track.
    const taken = items.filter((item) => item.trackId === below);
    if (i === 0 || !taken.some((item) => intersects(item.clip, piece))) {
      return items.push({ trackId: below, clip: piece });
    }
    const lane = tracksOfType(doc, 'video');
    const at = lane.findIndex((track) => track.trackId === below);
    const above = lane[at - 1];
    const free = above && !above.locked && !above.clips.some((other) => intersects(other, clip));
    if (free) below = above.trackId;
    else {
      below = newId('v');
      doc = moveTrack(addTrack(doc, 'video', { trackId: below }), below, at);
    }
    items.push({ trackId: below, clip: piece });
  });
  return addClips(doc, items, { autoCrossfade: false });
}
