/**
 * Putting an element clip on the timeline: making the clip, and choosing
 * its place by what kind of element it is. Internal to `elementClip.js`.
 * Isomorphic and pure.
 * @module utils/edl/elementInsert
 */

import { coverTime } from '#utils/brand/element/expand.js';
import { clipKind, createClip } from './factory.js';
import { tracksOfType } from './immutable.js';
import { addOverlay, overlaySpan } from './overlayClip.js';
import { addClips, pickTrack } from './placement.js';
import { rippleInsert } from './ripple.js';
import { EPS, finite, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/** Longest label a clip is given, characters. */
const LABEL = 48;

/**
 * The label of an element clip: the text of its first filled slot.
 * @param {{ slots: Record<string, string>, design: { slots: string[] } }} element
 * @param {string} [fallback] - When no slot is filled: the element's own label
 * @returns {string}
 */
export function elementLabel(element, fallback = '') {
  const first = element.design.slots
    .map((name) => element.slots[name])
    .find((text) => text?.trim());
  return (first || fallback).replace(/\s+/g, ' ').trim().slice(0, LABEL);
}

/**
 * A new element clip, not yet on a track: `time … time + duration`.
 * @param {Edl} edl
 * @param {import('#utils/brand/types.js').ElementBlock} element
 * @param {string|undefined} name - The element's label in its kit
 * @param {{ time?: number, duration?: number, label?: string }} opts
 * @returns {Clip}
 */
export function newElementClip(edl, element, name, opts) {
  const { design } = element;
  const wanted = finite(opts.duration, 0) > 0 ? opts.duration : design.duration;
  const span = overlaySpan(edl, opts.time, wanted);
  const label =
    typeof opts.label === 'string' ? opts.label : elementLabel(element, name || element.id);
  const intent = design.kind === 'transition' ? 'transition' : 'title';
  return /** @type {Clip} */ (createClip({ ...span, label, intent, element }));
}

/**
 * Where the picture is cut: every time a clip on a video track begins or
 * ends beside another — the middle of a cross-fade — leaving out overlays
 * that sit over the picture (titles and other elements).
 * @param {Edl} edl
 * @returns {number[]} Timeline seconds, sorted, each once
 */
export function cutTimes(edl) {
  const cuts = new Set();
  for (const track of tracksOfType(edl, 'video')) {
    const shots = track.clips.filter(
      (clip) => !['title', 'element'].includes(clipKind(clip, track)),
    );
    shots.forEach((clip, i) => {
      const next = shots[i + 1];
      const overlap = next ? clip.timelineEnd - next.timelineStart : -Infinity;
      if (overlap > EPS) cuts.add(next.timelineStart + overlap / 2);
      else if (clip.timelineEnd > EPS) cuts.add(clip.timelineEnd);
      if (clip.timelineStart > EPS && !(shots[i - 1]?.timelineEnd > clip.timelineStart + EPS)) {
        cuts.add(clip.timelineStart);
      }
    });
  }
  return [...cuts].sort((a, b) => a - b);
}

/**
 * Put a new element clip where its kind belongs (see `insertElement`).
 * @param {Edl} edl
 * @param {Clip} clip - As `newElementClip` made it
 * @param {{ time?: number, trackId?: string, ripple?: boolean, autoCrossfade?: boolean }} opts
 * @returns {Edl}
 */
export function placeElement(edl, clip, opts) {
  const { kind } = clip.element.design;
  const length = clip.timelineEnd - clip.timelineStart;
  if (kind === 'transition') {
    const cuts = cutTimes(edl);
    const at = finite(opts.time, 0);
    const cut = cuts.reduce(
      (best, time) => (Math.abs(time - at) < Math.abs(best - at) ? time : best),
      cuts[0],
    );
    // The moment the frame is covered lands on the cut.
    const wanted =
      cut === undefined ? clip.timelineStart : cut - coverTime(clip.element.design, length);
    const start = Math.max(0, snap(edl, wanted));
    const moved = { ...clip, timelineStart: start, timelineEnd: snap(edl, start + length) };
    return addOverlay(edl, moved, opts);
  }
  if (kind !== 'segment' || opts.ripple === false) return addOverlay(edl, clip, opts);
  // A segment takes its own time: open a gap, then fill it on the main video track.
  const opened = rippleInsert(edl, clip.timelineStart, length);
  const lane = tracksOfType(opened, 'video');
  const { edl: doc, track } = pickTrack(opened, 'video', opts.trackId, [...lane].reverse());
  return addClips(doc, [{ trackId: track.trackId, clip }], { autoCrossfade: false });
}
