/**
 * The inspector's view of a selection: which groups to show, the value of
 * every field merged across the clips it applies to, timing, links and
 * groups. Built from the document on every change; the components only
 * render it. Pure and isomorphic.
 * @module utils/inspector/model
 */

import { neighbourOverlaps } from '#utils/edl/fades.js';
import { EPS } from '#utils/edl/time.js';
import { mergedValue } from './paths.js';
import { describeSelection, linkState, timingOf } from './selectionInfo.js';
import { isSingleEvent, selectedClips, targetsOf } from './targets.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/** @typedef {{ value: any, mixed: boolean, count: number }} FieldState */

/** Every path the inspector can show, grouped only for readability. */
const PATHS = [
  ...['label', 'color', 'fadeIn', 'fadeOut', 'volume', 'prompt', 'intent'],
  ...['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'fit'].map((k) => `transform.${k}`),
  ...['Top', 'Bottom', 'Left', 'Right'].map((side) => `transform.crop${side}`),
  ...['enabled', 'startX', 'startY', 'startScale', 'endX', 'endY', 'endScale'].map(
    (k) => `transform.kenBurns.${k}`,
  ),
  ...['content', 'fontFamily', 'fontSize', 'color', 'background', 'align', 'bold', 'italic'].map(
    (k) => `text.${k}`,
  ),
  ...['outlineColor', 'outlineWidth'].map((k) => `text.${k}`),
];

/**
 * @typedef {Object} InspectorModel
 * @property {import('./targets.js').SelectedClip[]} refs
 * @property {number} count
 * @property {boolean} locked - A selected clip sits on a locked track
 * @property {string} heading
 * @property {string} detail
 * @property {Record<string, FieldState>} fields - Only paths with a target
 * @property {{ volume: boolean, transform: ''|'basic'|'full', text: boolean,
 *   placeholder: boolean }} show
 * @property {ReturnType<typeof timingOf>} timing
 * @property {{ in: boolean, out: boolean }} fadeLocks - Edge is a cross-fade on every clip
 * @property {ReturnType<typeof linkState>} link
 * @property {number} fps
 * @property {string} resolution
 */

/**
 * @param {Edl} edl
 * @param {string[]} selection - Selected clip ids
 * @returns {InspectorModel}
 */
export function inspectorModel(edl, selection) {
  const refs = selectedClips(edl, selection);
  /** @type {Record<string, FieldState>} */
  const fields = {};
  for (const path of PATHS) {
    const targets = targetsOf(refs, path);
    if (!targets.length) continue;
    const clips = targets.map((ref) => ref.clip);
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
      placeholder: 'prompt' in fields,
    },
    timing: timingOf(refs, isSingleEvent(refs)),
    fadeLocks: {
      in: refs.length > 0 && overlaps.every((o) => o.in > EPS),
      out: refs.length > 0 && overlaps.every((o) => o.out > EPS),
    },
    link: linkState(refs),
    fps: edl?.fps > 0 ? edl.fps : 30,
    resolution: edl?.resolution || '1920x1080',
  };
}
