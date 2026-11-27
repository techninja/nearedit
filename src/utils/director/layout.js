/**
 * The director's track layout — which fragment track holds what.
 *
 * `index` is the Nth track of that `type` in the document (0 = first), the
 * addressing used by DirectorResult (docs/app-spec/API.md). The first video
 * track is the front-most layer, so titles sit above cutaways, which sit
 * above the main picture. Documented in docs/app-spec/DIRECTOR.md.
 *
 * Isomorphic and pure.
 * @module utils/director/layout
 */

/**
 * @typedef {Object} TrackSlot
 * @property {'video'|'audio'} type
 * @property {number} index - Nth track of that type
 * @property {string} name
 */

/** @type {Record<'titles'|'broll'|'main'|'dialogue'|'ambience'|'music', TrackSlot>} */
export const LAYOUT = {
  titles: { type: 'video', index: 0, name: 'Titles' },
  broll: { type: 'video', index: 1, name: 'B-roll' },
  main: { type: 'video', index: 2, name: 'Main' },
  dialogue: { type: 'audio', index: 0, name: 'Dialogue' },
  ambience: { type: 'audio', index: 1, name: 'Ambience' },
  music: { type: 'audio', index: 2, name: 'Music' },
};

/** Clip gain of a music bed playing under speech. */
export const MUSIC_LEVEL_UNDER_SPEECH = 0.25;
/** Clip gain of a music bed when nothing is spoken over it. */
export const MUSIC_LEVEL_ALONE = 0.7;
/** Clip gain of b-roll natural sound in `low` mode. */
export const AMBIENCE_LEVEL = 0.25;

/**
 * Slot keys in display order (video front to back, then audio).
 * @returns {string[]}
 */
export function layoutOrder() {
  return ['titles', 'broll', 'main', 'dialogue', 'ambience', 'music'];
}
