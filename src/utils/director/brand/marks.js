/**
 * What a brand pass leaves on a timeline, and how it finds it again. Every
 * clip the pass places is marked in its `intent` — `brand:intro`,
 * `brand:name` … — so a later pass knows its own clips from the editor's,
 * brings them up to date instead of adding them again, and never touches
 * an element somebody placed by hand. The pass keeps its overlays on two
 * tracks of its own, in front of the picture: `Brand` (cards, names,
 * stingers) and, behind it, `Logo` (the bug).
 * Isomorphic and pure.
 * @module utils/director/brand/marks
 */

import { addTrack, isElementClip, moveTrack, tracksOfType } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/** The marks, by what a clip is in the pass. */
export const MARKS = Object.freeze({
  intro: 'brand:intro',
  outro: 'brand:outro',
  bug: 'brand:bug',
  chapter: 'brand:chapter',
  stinger: 'brand:stinger',
  name: 'brand:name',
  item: 'brand:item',
});

/** The tracks of the pass, front first. */
export const TRACKS = Object.freeze({ brand: 'Brand', logo: 'Logo' });
/** The marks whose clips live on each. */
/** @type {Record<keyof typeof TRACKS, string[]>} */
const HOLDS = { brand: [MARKS.chapter, MARKS.stinger, MARKS.name, MARKS.item], logo: [MARKS.bug] };

/**
 * The clips a pass placed, as something: on unlocked tracks, in time order.
 * @param {Edl} edl
 * @param {string} mark - One of `MARKS`
 * @returns {{ clip: any, track: any }[]}
 */
export function marked(edl, mark) {
  return edl.tracks
    .filter((track) => !track.locked)
    .flatMap((track) =>
      track.clips
        .filter((clip) => clip.intent === mark && isElementClip(clip))
        .map((clip) => ({ clip, track })),
    )
    .sort((a, b) => a.clip.timelineStart - b.clip.timelineStart);
}

/**
 * One of the pass's own tracks: the one that already holds its clips, else
 * an unlocked, empty track of that name, else a new one in front — the
 * logo's right behind the brand's.
 * @param {Edl} edl
 * @param {keyof typeof TRACKS} which
 * @returns {{ edl: Edl, trackId: string }}
 */
export function brandTrack(edl, which) {
  const video = tracksOfType(edl, 'video').filter((track) => !track.locked);
  const used = video.find((track) =>
    track.clips.some((clip) => HOLDS[which].includes(clip.intent)),
  );
  const spare = video.find((track) => track.name === TRACKS[which] && !track.clips.length);
  if (used || spare) return { edl, trackId: (used || spare).trackId };
  const added = addTrack(edl, 'video', { position: 'top', name: TRACKS[which] });
  const trackId = tracksOfType(added, 'video')[0].trackId;
  if (which !== 'logo') return { edl: added, trackId };
  // Behind the brand's own track, when there is one: a card covers the bug, not the other way.
  const lane = tracksOfType(added, 'video');
  const front = lane.findIndex((track) =>
    track.clips.some((clip) => HOLDS.brand.includes(clip.intent)),
  );
  return { edl: front < 0 ? added : moveTrack(added, trackId, front), trackId };
}
