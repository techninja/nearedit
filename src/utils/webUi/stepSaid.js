/**
 * What the recorder says about a step, read back from its sentences. A
 * recording — or the snapshot of the page before a step — that cannot play
 * a step fails with `Step 3 (click): css=#buy is covered by <div#chat.bubble>
 * "Talk to us"`, `… cannot be brought into view: it is cut off by <div#closed>`
 * or a target that was not found; with `onMissing: skip` the same sentences
 * arrive as warnings. This finds the step such a sentence is about, what is
 * in the way, and what can be done about it (WEBCLIP.md § Targets: hide what
 * covers the target, or aim elsewhere). Pure and isomorphic.
 * @module utils/webUi/stepSaid
 */

/**
 * @typedef {Object} StepSaid
 * @property {number} index - The step the sentence is about
 * @property {string} text - The sentence
 * @property {'covered'|'cut'|'other'} kind - Something covers the target;
 *   it cannot be brought into view; anything else (not found…)
 * @property {string} cover - A CSS selector for what is in the way, when
 *   the sentence names an element; '' otherwise
 * @property {string} advice - What can be done about it
 */

const STEP = /\bStep (\d+) \((\w+)\): /;
const NAMED = /<([a-z][\w-]*(?:#[\w-]+)?(?:\.[\w-]+)*)>/i;

const ADVICE = {
  covered: 'Hide what is in the way before recording, or aim the step at something else.',
  cut: 'Aim the step at something that can be scrolled into view, or open what holds it first.',
  other: 'Pick the target again on the page as it is before this step.',
};

/**
 * The selector of an element as the recorder describes it:
 * `<div#chat.bubble> "Talk to us"` → `div#chat.bubble`.
 * @param {string} description
 * @returns {string} '' when no element is named
 */
export function coverSelector(description) {
  const named = NAMED.exec(String(description ?? ''));
  return named ? named[1] : '';
}

/**
 * Read one sentence of the recorder.
 * @param {string} text - An error or a warning
 * @returns {StepSaid|null} null when it is not about a step
 */
export function readStepSaid(text) {
  const sentence = String(text ?? '');
  const found = STEP.exec(sentence);
  if (!found) return null;
  const covered = /\bis covered by (.+)$/.exec(sentence);
  const cut = /\bcannot be brought into view\b/.test(sentence);
  const kind = covered ? 'covered' : cut ? 'cut' : 'other';
  return {
    index: Number(found[1]) - 1,
    text: sentence,
    kind,
    cover: covered ? coverSelector(covered[1]) : '',
    advice: ADVICE[kind],
  };
}

/**
 * Everything the recorder said about steps, once each.
 * @param {(string|undefined|null)[]} texts - Errors and warnings, in the
 *   order they matter
 * @returns {StepSaid[]}
 */
export function stepsSaid(texts) {
  /** @type {Map<string, StepSaid>} */
  const said = new Map();
  for (const text of texts) {
    const one = readStepSaid(text);
    if (one && !said.has(one.text)) said.set(one.text, one);
  }
  return [...said.values()];
}

/**
 * The first thing said about each step, for the steps list.
 * @param {StepSaid[]} said
 * @returns {Record<number, Record<string, string>>} As `recipeProblems`
 *   sorts problems: by step, under the name `recorder`
 */
export function saidByStep(said) {
  /** @type {Record<number, Record<string, string>>} */
  const sorted = {};
  for (const one of said) sorted[one.index] ??= { recorder: one.text };
  return sorted;
}

/**
 * A recipe's `hide` list with one more target.
 * @param {any[]} hide
 * @param {string} target
 * @returns {any[]} The same list when the target is already on it, or empty
 */
export function withHidden(hide, target) {
  const wanted = String(target ?? '').trim();
  return !wanted || hide.includes(wanted) ? hide : [...hide, wanted];
}
