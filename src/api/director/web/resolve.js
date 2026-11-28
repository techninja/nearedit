/**
 * From stops to steps: every name a stop gives is matched to an element of
 * the page as the demo will find it at that moment — the snapshot is taken
 * again after a step that may have changed the page — and becomes a
 * target. A name nothing fits is looked for by its text when the recording
 * gets there. Reference: docs/app-spec/DIRECTOR-WEB.md § Matching names.
 * @module api/director/web/resolve
 */

import { matchElement } from '#utils/director/web/match.js';
import { scrollWord, stopStep } from '#utils/director/web/steps.js';
import { wordCount } from '#utils/director/web/words.js';

/** Steps after which the page may hold other things than before. */
const CHANGES = ['click', 'type', 'press', 'select', 'goto'];
/** A name of more words than this that fits nothing is a sentence, not a name. */
const SENTENCE = 4;

/**
 * @typedef {{ do: string, on?: string, text?: string, say?: string }} Stop
 * @typedef {Object} Resolved
 * @property {Record<string, any>[]} steps - One per stop, without timing
 * @property {(import('#utils/director/web/match.js').Match|null)[]} matches - Per stop
 * @property {string[]} notes
 */

/**
 * "2", "2 and 5", "2, 5 and 9".
 * @param {number[]} numbers
 * @returns {string}
 */
function listed(numbers) {
  if (numbers.length < 2) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/**
 * Turn the stops of a plan into the steps of a recipe.
 * @param {Stop[]} stops - Valid against the plan schema
 * @param {import('./survey.js').Seen} first - The page as it loads
 * @param {import('./survey.js').Survey} survey
 * @returns {Promise<Resolved>}
 */
export async function resolveStops(stops, first, survey) {
  let page = first;
  let changed = false; // something since the last look may have changed the page
  let gone = false; // the demo is on another page than the last look saw
  let doubt = false; // …or may be: a link was clicked
  const again = [];
  const blind = [];
  const notes = [];
  const steps = [];
  const matches = [];
  for (const [i, stop] of stops.entries()) {
    const named = Boolean(stop.on) && !(stop.do === 'scroll' && scrollWord(stop.on));
    let found = named && !gone ? matchElement(stop.on, page.elements, stop.do) : null;
    if (named && (gone || doubt || (!found && changed)) && !survey.spent()) {
      page = await survey.look(steps);
      [changed, gone, doubt] = [false, false, false];
      again.push(i);
      found = matchElement(stop.on, page.elements, stop.do);
    }
    if (named && gone) blind.push(i + 1);
    const sentence = stop.do === 'scroll' && named && !found && wordCount(stop.on) > SENTENCE;
    if (sentence) {
      steps.push({ do: 'wait', note: stop.say || '' });
      notes.push(
        `Stop ${i + 1}: no heading matches “${stop.on}” — the page stays where it is ` +
          'while the caption shows.',
      );
    } else {
      steps.push(stopStep(stop, found?.element || null, page));
      if (named && !found && !gone) {
        notes.push(
          `Stop ${i + 1}: nothing on the page is called “${stop.on}” — the recording looks for ` +
            'that text when it gets there, and passes over the step if it is not found.',
        );
      } else if (found && found.quality < 0.9) {
        notes.push(
          `Stop ${i + 1}: “${stop.on}” was taken to be the ${found.element.kind} ` +
            `“${found.element.name}”.`,
        );
      }
    }
    matches.push(found);
    if (CHANGES.includes(stop.do)) changed = true;
    if (stop.do === 'goto') gone = true;
    if (stop.do === 'click' && found?.element.kind !== 'button') doubt = true;
  }
  if (again.length) {
    notes.push(
      `The page was read again before stop ${listed(again.map((i) => i + 1))}: a click or a ` +
        'new page had changed what is on it.',
    );
  }
  if (blind.length) {
    notes.push(
      `Stop ${listed(blind)} could not be matched to the page it happens on (the page is ` +
        `read ${survey.count()} times at most): the recording looks for those names by their text.`,
    );
  }
  return { steps, matches, notes };
}
