/**
 * The customisation the Brand dialog is working on: the kit it builds on,
 * the draft, and what the draft amounts to (the kit the live preview
 * draws). Without a draft nothing is being customised.
 * @module utils/brandUi/draftState
 */

import { createObservable } from '#utils/ui/observable.js';
import { startDraft } from './draft.js';
import { dropPending, fileUrlOf } from './draftFiles.js';
import { readKit } from './kitApi.js';
import { builtinEffective } from './kitList.js';
import { FALLBACK_KIT, isKitAnswer, kitState } from './kitState.js';
import { previewKit } from './previewKit.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */
/** @typedef {import('./draft.js').Draft} Draft */

/**
 * @typedef {Object} DraftState
 * @property {Draft|null} draft
 * @property {Kit} base - The effective kit the draft builds on
 * @property {Kit} preview - What the draft amounts to: the kit the preview draws
 * @property {boolean} dirty - Something was changed since it was started or saved
 * @property {string} problem - Why the last file could not be taken
 */

/** @type {import('#utils/ui/observable.js').Observable<DraftState>} */
export const draftState = createObservable({
  ...{ draft: null, base: FALLBACK_KIT, preview: FALLBACK_KIT, dirty: false, problem: '' },
});

/**
 * Put a draft into the state, with what it amounts to.
 * @param {Draft} draft
 * @param {Partial<DraftState>} [more]
 */
export function showDraft(draft, more = {}) {
  const base = more.base || draftState.get().base;
  draftState.set({ draft, preview: previewKit(base, draft, fileUrlOf), problem: '', ...more });
}

/**
 * The effective kit a draft builds on.
 * @param {string} id - A library id or `builtin:<name>`
 * @returns {Promise<Kit>} The built-in `clean` kit when it cannot be read
 */
async function baseOf(id) {
  const builtin = builtinEffective(id);
  if (builtin) return builtin;
  try {
    const answer = await readKit(id);
    if (isKitAnswer(answer)) return answer.effective;
  } catch (err) {
    console.warn(
      `[brand] the kit "${id}" a customisation builds on could not be read:`,
      err.message,
    );
  }
  return FALLBACK_KIT;
}

/**
 * Start customising: from the project's own kit when it has one, else as
 * a new kit that extends the one in use.
 * @returns {Promise<void>}
 */
export async function beginDraft() {
  dropPending();
  const state = kitState.get();
  const draft = startDraft(state);
  const own = state.choice === 'project';
  showDraft(draft, { base: own ? await baseOf(draft.extends) : state.effective, dirty: false });
}

/** Stop customising and forget what was not saved. */
export function endDraft() {
  dropPending();
  draftState.set({ draft: null, dirty: false, problem: '' });
}

/**
 * The draft was saved: the files it waited with are on the server now.
 * @param {Draft} [draft] - The draft as it was saved (with the names the server gave its files)
 */
export function draftSaved(draft = draftState.get().draft) {
  dropPending();
  if (draft) showDraft(draft, { dirty: false });
}
