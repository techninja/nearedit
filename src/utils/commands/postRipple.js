/**
 * Post-edit ripple, the Vegas way: make an edit, then press F and what
 * comes after it follows. This module remembers what the last edit changed
 * (any edit: a key, a drag, a menu) and replays it with a ripple of the
 * chosen scope. Auto ripple is the same thing done at once, as part of the
 * edit's own undo step.
 * @module utils/commands/postRipple
 */

import { getUserPrefs } from '#store/UserPrefs.js';
import { replayRippled } from '#utils/edl/selectionEdits.js';
import { edit, getDoc, onDocChange } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { describeEdit } from './editChange.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {'track'|'marks'|'all'} RippleScope */

/** @type {Edl} The document as of the last finished change */
let settled = getDoc();
/** @type {{ before: Edl, after: Edl, change: import('#utils/edl/selectionEdits.js').EditChange }|null} */
let last = null;
/** @type {Edl|null} A document `rippled` made: it has its ripple already */
let followed = null;
/** @type {Set<() => void>} */
const listeners = new Set();

/** @param {typeof last} next */
function remember(next) {
  const changed = !!next !== !!last;
  last = next;
  if (changed) for (const listener of listeners) listener();
}

onDocChange((doc, info) => {
  if (info.transient) return;
  const before = settled;
  settled = doc;
  // Undo, redo and loading leave nothing to follow; nor does an edit that
  // a ripple has already followed.
  const edited = info.reason === 'edit' || info.reason === 'gesture';
  const plain = edited && !getView().ripple && doc !== followed;
  const change = plain ? describeEdit(before, doc) : null;
  remember(change ? { before, after: doc, change } : null);
});

/** The last edit carried its own ripple (paste insert): F has nothing to follow. */
export const forgetLastEdit = () => remember(null);

/**
 * The ripple that F would make now, for drawing where it starts.
 * @returns {import('#utils/edl/selectionEdits.js').RippleStep[]|null} null when the last change
 *   left nothing to follow
 */
export function pendingRipple() {
  return last && last.after === getDoc() ? last.change.steps : null;
}

/** @returns {boolean} True when F has something to do */
export const canPostRipple = () => pendingRipple() !== null;

/**
 * Be told when a ripple becomes available or stops being so.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onPendingRipple(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ripple the last edit: later clips on the tracks it worked on follow it
 * (`track`), markers and regions too (`marks`), or every track (`all`).
 * One undo step; undoing it leaves the edit itself in place.
 * @param {RippleScope} scope
 * @returns {boolean} false when there was nothing to ripple
 */
export function postEditRipple(scope) {
  if (!canPostRipple()) return false;
  const { before, change } = last;
  const { autoCrossfade } = getView();
  const done = edit(() => replayRippled(before, change, { scope, autoCrossfade }));
  remember(null);
  return done;
}

/**
 * An edit followed at once by its ripple — what auto ripple does.
 * @param {Edl} before - Document the edit started from
 * @param {Edl} plain - What the edit made of it, without any ripple
 * @param {RippleScope} [scope] - Defaults to the auto-ripple scope the user chose
 * @returns {Edl}
 */
export function rippled(before, plain, scope = getUserPrefs().rippleScope) {
  const change = describeEdit(before, plain);
  const { autoCrossfade } = getView();
  followed = change ? replayRippled(before, change, { scope, autoCrossfade }) : plain;
  return followed;
}
