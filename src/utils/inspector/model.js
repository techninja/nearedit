/**
 * The inspector's view of a selection: which groups to show, the value of
 * every field merged across the clips it applies to, timing, links and
 * groups. Values are those at the playhead — a keyframed property shows
 * what it is at that moment. Built from the document on every change; the
 * components only render it. Pure and isomorphic.
 * @module utils/inspector/model
 */

import { resolveClip } from '#utils/edl/animate.js';
import { neighbourOverlaps } from '#utils/edl/fades.js';
import { EPS } from '#utils/edl/time.js';
import { PATHS } from './modelPaths.js';
import { mergedValue } from './paths.js';
import { describeSelection, linkState, timingOf } from './selectionInfo.js';
import { isSingleEvent, isVisual, selectedClips, targetsOf } from './targets.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/** @typedef {{ value: any, mixed: boolean, count: number }} FieldState */

/**
 * @typedef {Object} InspectorModel
 * @property {import('./targets.js').SelectedClip[]} refs
 * @property {number} count
 * @property {boolean} locked - A selected clip sits on a locked track
 * @property {string} heading
 * @property {string} detail
 * @property {Record<string, FieldState>} fields - Only paths with a target
 * @property {{ volume: boolean, transform: ''|'basic'|'full', text: boolean,
 *   generator: boolean, placeholder: boolean }} show
 * @property {import('./targets.js').SelectedClip[]} visual - The selected
 *   clips that draw in the frame: they take effects and a blend mode
 * @property {ReturnType<typeof timingOf>} timing
 * @property {{ in: boolean, out: boolean }} fadeLocks - Edge is a cross-fade on every clip
 * @property {ReturnType<typeof linkState>} link
 * @property {number} time - The playhead the values were read at, timeline seconds
 * @property {number} fps
 * @property {string} resolution
 */

/**
 * The clip as it shows at a moment (keyframes applied).
 * @param {any} clip
 * @param {number|undefined} time
 * @returns {any}
 */
export const shownClip = (clip, time) => (Number.isFinite(time) ? resolveClip(clip, time) : clip);

/**
 * @param {Edl} edl
 * @param {string[]} selection - Selected clip ids
 * @param {number} [time] - The playhead, timeline seconds; without it the
 *   plain stored values show
 * @returns {InspectorModel}
 */
export function inspectorModel(edl, selection, time) {
  const refs = selectedClips(edl, selection);
  /** @type {Record<string, FieldState>} */
  const fields = {};
  for (const path of PATHS) {
    const targets = targetsOf(refs, path);
    if (!targets.length) continue;
    const clips = targets.map((ref) => shownClip(ref.clip, time));
    fields[path] = { ...mergedValue(clips, path), count: targets.length };
  }
  const overlaps = refs.map(
    ({ clip, track }) => neighbourOverlaps(track.clips).get(clip.clipId) || { in: 0, out: 0 },
  );
  const picture = 'transform.fit' in fields;
  return {
    refs,
    count: refs.length,
    locked: refs.some((ref) => ref.track.locked),
    ...describeSelection(refs),
    fields,
    show: {
      volume: 'volume' in fields,
      transform: picture ? 'full' : 'transform.x' in fields ? 'basic' : '',
      text: 'text.content' in fields,
      generator: 'generator.seed' in fields,
      placeholder: 'prompt' in fields,
    },
    visual: refs.filter(isVisual),
    timing: timingOf(refs, isSingleEvent(refs)),
    fadeLocks: {
      in: refs.length > 0 && overlaps.every((o) => o.in > EPS),
      out: refs.length > 0 && overlaps.every((o) => o.out > EPS),
    },
    link: linkState(refs),
    time: Number.isFinite(time) ? time : 0,
    fps: edl?.fps > 0 ? edl.fps : 30,
    resolution: edl?.resolution || '1920x1080',
  };
}
