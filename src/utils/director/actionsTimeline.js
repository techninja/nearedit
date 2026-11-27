/**
 * Action schemas for the actions that work on the existing timeline:
 * insert_broll, remove_silence, beat_sync, add_captions.
 * Isomorphic, pure data.
 * @module utils/director/actionsTimeline
 */

import { NATURAL_SOUND, PADDING, SILENCE_THRESHOLD, range, select, toggle } from './fields.js';

/**
 * In-place actions: `replace` works on the whole timeline (or the selected
 * clips), `range` only on clips inside `context.range`.
 */
const SCOPE_MODES = ['replace', 'range'];

/** @type {import('./actions.js').ActionSchema} */
export const INSERT_BROLL = {
  id: 'insert_broll',
  title: 'Insert b-roll',
  description:
    'Find footage or stills matching the prompt by tags, description and transcript, ' +
    'and place it at the playhead.',
  llm: 'optional',
  jobType: 'director',
  modes: ['insert', 'append', 'prepend', 'range'],
  defaultMode: 'insert',
  inPlace: false,
  prompt: {
    label: 'What should it show?',
    placeholder: 'the dog running on the beach',
    required: false,
  },
  fields: [
    range('duration', 'Length of each clip', [1, 30, 0.5], 4, 's'),
    range('count', 'Clips', [1, 8, 1], 1),
    select(
      'placement',
      'Placement',
      [
        ['insert', 'Push later clips along (ripple insert)'],
        ['overlay', 'Lay over the picture (cutaway)'],
      ],
      'insert',
      'A cutaway covers the picture at the playhead and leaves the sound and timing alone.',
    ),
    NATURAL_SOUND,
    toggle(
      'useLlm',
      'Let the LLM choose',
      false,
      'Ranks the candidates with the language model; falls back to keyword matching.',
    ),
  ],
};

/** @type {import('./actions.js').ActionSchema} */
export const REMOVE_SILENCE = {
  id: 'remove_silence',
  title: 'Remove silence',
  description:
    'Tighten the selected clips — or every speech clip — by cutting out pauses. Linked ' +
    'picture and sound are split together and later clips close the gaps.',
  llm: 'no',
  jobType: 'director',
  modes: SCOPE_MODES,
  defaultMode: 'replace',
  inPlace: true,
  prompt: null,
  fields: [SILENCE_THRESHOLD, PADDING],
};

/** @type {import('./actions.js').ActionSchema} */
export const BEAT_SYNC_ACTION = {
  id: 'beat_sync',
  title: 'Beat sync',
  description:
    'Move the cuts of the picture track onto the beats of a music clip. Select the music ' +
    'clip, or let the director find it.',
  llm: 'no',
  jobType: 'director',
  modes: SCOPE_MODES,
  defaultMode: 'replace',
  inPlace: true,
  prompt: null,
  fields: [
    select(
      'every',
      'Cut on',
      [
        ['1', 'Any beat'],
        ['2', 'Every 2nd beat'],
        ['4', 'Every 4th beat (bars)'],
      ],
      '1',
    ),
    range('maxShift', 'Move a cut at most', [0.05, 2, 0.05], 0.5, 's'),
    toggle(
      'protectSpeech',
      'Never cut into a word',
      true,
      'Cuts whose move would clip a spoken word are left where they are.',
    ),
  ],
};

/** @type {import('./actions.js').ActionSchema} */
export const ADD_CAPTIONS = {
  id: 'add_captions',
  title: 'Add captions',
  description:
    'Title clips from the transcript of the selected clips — or every speech clip — timed ' +
    'to the words and grouped into readable phrases.',
  llm: 'no',
  jobType: 'director',
  modes: SCOPE_MODES,
  defaultMode: 'replace',
  inPlace: true,
  prompt: null,
  fields: [
    range('maxChars', 'Characters per caption', [12, 80, 1], 36),
    range('maxDuration', 'Longest caption', [1, 8, 0.5], 4, 's'),
    select('position', 'Position', ['bottom', 'middle', 'top'], 'bottom'),
    select('size', 'Size', ['small', 'medium', 'large'], 'medium'),
    toggle('background', 'Box behind the text', false),
  ],
};
