/**
 * The brand pass — one step that dresses a finished timeline in the
 * project's brand: the kit's intro before the first picture and its outro
 * after the last, its logo bug over the piece, a lower third where each
 * named speaker first speaks, a stinger on the cuts at named markers, a
 * chapter card at each chapter, the timeline's caption style, and element
 * clips that were out of date brought up to it.
 *
 * It is made of the editor's own operations and it is **idempotent**: what
 * it places it marks (`marks.js`), and a later pass finds those clips and
 * keeps them — where the editor left them — changing only what they say.
 * It never moves or changes a clip that is not its own, but for the time
 * the intro opens at the start.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/pass
 */

import { bug, intro, outro } from './passCards.js';
import { captions, pictures, upToDate } from './passDoc.js';
import { items, names } from './passNames.js';
import { chapters } from './passOverlays.js';
import { stingers } from './passStingers.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} BrandPlan - A request with its times worked out, in
 *   seconds of the timeline as it was posted
 * @property {Record<string, boolean>} parts - intro, outro, bug, names,
 *   stingers, chapters, captions, restyle
 * @property {string} title
 * @property {string} subtitle
 * @property {{ title: string, text: string }|null} closing
 * @property {{ name: string, role: string, time: number|null, until: number|null, why?: string }[]} speakers
 * @property {{ title: string, at: number|null }[]} chapters
 * @property {any[]} items - Resolved element items, each with `at`
 * @typedef {{ what: string, at: number, state: 'placed'|'kept'|'updated'|'removed', why?: string }} Done
 * @typedef {Object} PassState
 * @property {Edl} doc
 * @property {import('#utils/brand/types.js').Kit} kit
 * @property {BrandPlan} plan
 * @property {Done[]} log
 * @property {string[]} notes
 * @property {{ from: number, by: number }|null} opened - The time an intro opened
 * @property {(time: number) => number} later - A time of the posted timeline, now
 * @property {{ style: object, changed: boolean }|null} captions
 * @property {number} restyled
 * @property {number} lockedStale
 */

/**
 * Dress a timeline in a brand.
 * @param {Edl} edl
 * @param {import('#utils/brand/types.js').Kit} kit - An effective kit
 * @param {BrandPlan} plan
 * @returns {{ edl: Edl, done: Done[], notes: string[], empty: boolean,
 *   captions: PassState['captions'], restyled: number, lockedStale: number,
 *   opened: PassState['opened'] }} `empty`: the timeline has no picture to dress
 */
export function brandPass(edl, kit, plan) {
  /** @type {PassState} */
  const state = {
    ...{ doc: edl, kit, plan, log: [], notes: [], opened: null },
    ...{ captions: null, restyled: 0, lockedStale: 0 },
    later: (time) =>
      state.opened && time >= state.opened.from - 1e-6 ? time + state.opened.by : time,
  };
  const { parts } = plan;
  upToDate(state, parts.restyle);
  const empty = !pictures(state.doc).length;
  if (!empty) {
    if (parts.intro) intro(state);
    if (parts.outro) outro(state);
    const cards = parts.chapters ? chapters(state) : [];
    if (parts.stingers) stingers(state, cards);
    if (parts.names) names(state);
    items(state);
    if (parts.bug) bug(state);
  }
  if (parts.captions) captions(state);
  const { doc, log, notes, opened, restyled, lockedStale } = state;
  return {
    edl: doc,
    done: log,
    notes,
    empty,
    captions: state.captions,
    restyled,
    lockedStale,
    opened,
  };
}
