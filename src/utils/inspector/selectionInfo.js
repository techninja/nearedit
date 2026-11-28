/**
 * Facts about a selection as a whole: its heading, its timing, and what
 * can be linked or grouped. Pure and isomorphic.
 * @module utils/inspector/selectionInfo
 */

import { isTimed } from '#utils/edl/immutable.js';

/** @typedef {import('./targets.js').SelectedClip} SelectedClip */

const KIND_NAMES = {
  video: 'video',
  audio: 'audio',
  image: 'image',
  title: 'title',
  generator: 'generator',
  element: 'brand element',
  placeholder: 'placeholder',
};

/**
 * @param {string} path
 * @returns {string} File name of a path
 */
const baseName = (path) =>
  String(path || '')
    .split(/[\\/]/)
    .pop();

/**
 * Heading and detail line for the inspector.
 * @param {SelectedClip[]} refs
 * @returns {{ heading: string, detail: string }}
 */
export function describeSelection(refs) {
  if (!refs.length) return { heading: '', detail: '' };
  const counts = new Map();
  for (const ref of refs) counts.set(ref.kind, (counts.get(ref.kind) || 0) + 1);
  // The kinds read as adjectives ("2 video"); a brand element is a noun and takes its plural.
  const kinds = [...counts].map(([kind, n]) =>
    n > 1 ? `${n} ${KIND_NAMES[kind]}${kind === 'element' ? 's' : ''}` : KIND_NAMES[kind],
  );
  const [{ clip }] = refs;
  const pair = refs.length === 2 && refs[0].clip.linkedClipId === refs[1].clip.clipId;
  if (refs.length === 1 || pair) {
    const heading =
      clip.label ||
      baseName(clip.sourceFile) ||
      clip.generator?.type ||
      clip.element?.id ||
      clip.text?.content?.split('\n')[0] ||
      'Clip';
    const tracks = refs.map((ref) => ref.track.name || ref.track.trackId).join(' + ');
    return { heading, detail: `${kinds.join(' + ')} · ${tracks}` };
  }
  return { heading: `${refs.length} clips`, detail: kinds.join(', ') };
}

/**
 * Timing of the selection. For a single event (one clip or a linked pair)
 * the fields are editable; otherwise it is a read-out of the span covered.
 * @param {SelectedClip[]} refs
 * @param {boolean} single
 * @returns {{ single: boolean, clipId: string, start: number, end: number,
 *   duration: number, sourceIn: number, sourceOut: number, timed: boolean }}
 */
export function timingOf(refs, single) {
  if (!refs.length)
    return {
      single: false,
      clipId: '',
      start: 0,
      end: 0,
      duration: 0,
      sourceIn: 0,
      sourceOut: 0,
      timed: false,
    };
  const start = Math.min(...refs.map((ref) => ref.clip.timelineStart));
  const end = Math.max(...refs.map((ref) => ref.clip.timelineEnd));
  const [{ clip, track }] = refs;
  return {
    single,
    clipId: clip.clipId,
    start,
    end,
    duration: end - start,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    timed: single && isTimed(clip, track),
  };
}

/**
 * What the link and group buttons can do for a selection.
 * @param {SelectedClip[]} refs
 * @returns {{ linked: number, canLink: boolean, canUnlink: boolean, partner: string,
 *   grouped: number, canGroup: boolean, canUngroup: boolean }} `partner`
 *   names a linked partner that is not itself selected
 */
export function linkState(refs) {
  const ids = new Set(refs.map((ref) => ref.clip.clipId));
  const linked = refs.filter((ref) => ref.clip.linkedClipId);
  const outside = linked.find((ref) => !ids.has(ref.clip.linkedClipId));
  const pair = refs.length === 2 && refs[0].clip.linkedClipId === refs[1].clip.clipId;
  const groups = new Set(refs.map((ref) => ref.clip.groupId));
  const grouped = refs.filter((ref) => ref.clip.groupId).length;
  return {
    linked: linked.length,
    canLink: refs.length === 2 && !pair && refs[0].track !== refs[1].track,
    canUnlink: linked.length > 0,
    partner: outside ? outside.clip.linkedClipId : '',
    grouped,
    canGroup: refs.length > 1 && !(groups.size === 1 && grouped === refs.length),
    canUngroup: grouped > 0,
  };
}
