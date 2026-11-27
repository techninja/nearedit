/**
 * Where a director action applies — the choices the panel offers for
 * `directive.mode`, in words, and when a choice destroys something and
 * must be confirmed. Pure.
 * @module utils/directorUi/modes
 */

import { formatTimecode } from '#utils/playback/timecode.js';
import { clipsInside, isEmptyTimeline } from '#utils/directorUi/context.js';

/**
 * @typedef {Object} ModeChoice
 * @property {string} id - replace | append | prepend | insert | range
 * @property {string} label
 * @property {string} hint - Where exactly, e.g. a timecode
 * @property {boolean} available
 * @typedef {Object} ModeSituation
 * @property {import('#utils/directorUi/context.js').DirectorRange|null} range
 * @property {number} insertAt - Seconds
 * @property {number} selected - Number of selected clips
 * @property {number} fps
 */

const NO_RANGE = 'Set a loop region on the timeline, or select clips, to use this';

/**
 * @param {import('#utils/directorUi/context.js').DirectorRange|null} range
 * @param {number} fps
 * @returns {string}
 */
function rangeHint(range, fps) {
  if (!range) return NO_RANGE;
  const from = range.source === 'loop' ? 'the loop region' : 'the selected clips';
  return `${formatTimecode(range.start, fps)} – ${formatTimecode(range.end, fps)} (${from})`;
}

/**
 * The mode choices of an action.
 * @param {{ modes: string[], inPlace: boolean }} action
 * @param {ModeSituation} situation
 * @returns {ModeChoice[]} Empty for an action without modes (script writing)
 */
export function modeChoices(action, { range, insertAt, selected, fps }) {
  const s = selected === 1 ? '' : 's';
  /** @type {Record<string, [string, string]>} */
  const texts = action.inPlace
    ? {
        replace: selected
          ? [`The ${selected} selected clip${s}`, 'Clear the selection to work on everything']
          : ['The whole timeline', 'Select clips first to work on just those'],
        range: ['Only inside the range', rangeHint(range, fps)],
      }
    : {
        replace: [
          'Replace the timeline',
          'Everything on unlocked tracks makes way for the new edit',
        ],
        append: ['Add at the end', 'After the last clip'],
        prepend: ['Add at the start', 'Everything else moves later'],
        insert: [
          'Insert at the cursor',
          `At ${formatTimecode(insertAt, fps)}; later clips move along`,
        ],
        range: ['Replace a range', rangeHint(range, fps)],
      };
  return action.modes.map((id) => ({
    id,
    label: texts[id]?.[0] || id,
    hint: texts[id]?.[1] || '',
    available: id !== 'range' || Boolean(range),
  }));
}

/**
 * The mode to use: the wanted one when it is offered and available,
 * otherwise the action's default, otherwise the first available one.
 * @param {{ defaultMode: string }} action
 * @param {ModeChoice[]} choices
 * @param {string} [wanted]
 * @returns {string} '' for an action without modes
 */
export function pickMode(action, choices, wanted = '') {
  const usable = choices.filter((choice) => choice.available).map((choice) => choice.id);
  if (usable.includes(wanted)) return wanted;
  if (usable.includes(action.defaultMode)) return action.defaultMode;
  return usable[0] || '';
}

/**
 * What must be confirmed before running: a mode that removes existing
 * clips. In-place actions rewrite clips rather than remove them, so they
 * never ask.
 * @param {{ inPlace: boolean, title: string }} action
 * @param {string} mode
 * @param {any} doc
 * @param {{ start: number, end: number }|null} range
 * @returns {{ title: string, message: string, confirmLabel: string }|null} null = no question
 */
export function destructiveQuestion(action, mode, doc, range) {
  if (action.inPlace) return null;
  if (mode === 'replace' && !isEmptyTimeline(doc))
    return {
      title: 'Replace the whole timeline?',
      message:
        `“${action.title}” will remove every clip and marker on unlocked tracks and put the new ` +
        'edit in their place.\n\nIt is one undo step: Undo brings everything back.',
      confirmLabel: 'Replace timeline',
    };
  const inside = mode === 'range' && range ? clipsInside(doc, range) : 0;
  if (!inside) return null;
  return {
    title: 'Replace this part of the timeline?',
    message:
      `${inside} clip${inside === 1 ? '' : 's'} inside the range ${inside === 1 ? 'is' : 'are'} ` +
      'cut out and the new material takes their place; later clips move to fit.\n\n' +
      'It is one undo step: Undo brings everything back.',
    confirmLabel: 'Replace range',
  };
}
