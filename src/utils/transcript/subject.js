/**
 * Which transcript the panel shows: a file pinned from the library, else
 * the selected clip, else the clip under the edit cursor. Pure.
 * @module utils/transcript/subject
 */

import { clipKind } from '#utils/edl/factory.js';
import { allClips } from '#utils/edl/query.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} Subject
 * @property {string} file - Source file to show; '' when there is none
 * @property {string} clipId - Focus clip (it plays `file`); '' without one
 * @property {'pinned'|'selection'|'cursor'|'none'} from
 * @property {string} note - Why there is no file, when a clip without
 *   speech is selected: `title`, `image` or `placeholder`
 */

/**
 * @param {{ edl: Edl, selection?: string[], cursor?: number, pinned?: string,
 *   hasTranscript?: (file: string) => boolean }} context - `hasTranscript`
 *   breaks ties: among several candidates a transcribed file wins
 * @returns {Subject}
 */
export function resolveSubject(context) {
  const { edl, selection = [], cursor = 0, pinned = '', hasTranscript = () => false } = context;
  const refs = allClips(edl || { tracks: [] });
  const timed = (/** @type {{ clip: any, track: any }} */ ref) =>
    ['video', 'audio'].includes(clipKind(ref.clip, ref.track));
  const best = (/** @type {{ clip: any, track: any }[]} */ list) =>
    list.find((ref) => hasTranscript(ref.clip.sourceFile)) || list[0];

  const selected = refs.filter((ref) => selection.includes(ref.clip.clipId));
  if (pinned) {
    const focus = selected.find((ref) => ref.clip.sourceFile === pinned);
    return { file: pinned, clipId: focus?.clip.clipId || '', from: 'pinned', note: '' };
  }
  if (selected.length) {
    const pick = best(selected.filter(timed));
    if (pick)
      return { file: pick.clip.sourceFile, clipId: pick.clip.clipId, from: 'selection', note: '' };
    const { clip, track } = selected[0];
    return { file: '', clipId: '', from: 'selection', note: clipKind(clip, track) };
  }
  const under = refs.filter(
    ({ clip }) => cursor >= clip.timelineStart && cursor < clip.timelineEnd,
  );
  const pick = best(under.filter(timed));
  if (pick)
    return { file: pick.clip.sourceFile, clipId: pick.clip.clipId, from: 'cursor', note: '' };
  return { file: '', clipId: '', from: 'none', note: '' };
}
