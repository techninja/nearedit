/**
 * Action schema of `add_captions`: captions for the speech on the timeline
 * — words on screen as they are spoken, switched on for the clips that
 * speak and drawn in one of the caption presets, or title clips of
 * readable phrases. Isomorphic, pure data.
 * Reference: docs/app-spec/DIRECTOR.md § Working on the existing timeline.
 * @module utils/director/actionsCaptions
 */

import { range, select, toggle } from './fields.js';

/** `replace` works on the whole timeline (or the selected clips), `range` inside `context.range`. */
const SCOPE_MODES = ['replace', 'range'];

/** Shown under a field that only title clips use. */
const PHRASES_ONLY = 'For phrases as title clips.';

/** @type {import('./actions.js').ActionSchema} */
export const ADD_CAPTIONS = {
  id: 'add_captions',
  title: 'Add captions',
  description:
    'Captions for the selected clips — or all the speech on the timeline: words on screen as ' +
    'they are spoken, in a look you name, or title clips of readable phrases.',
  llm: 'optional',
  noLlmNote:
    'The look is read from your words — “big bold”, “karaoke”, “boxed”, “subtitles” — by rule; ' +
    'the language model is not available.',
  jobType: 'director',
  modes: SCOPE_MODES,
  defaultMode: 'replace',
  inPlace: true,
  prompt: {
    label: 'What should they look like?',
    placeholder: 'big bold captions',
    required: false,
  },
  shown: 3,
  fields: [
    // Not `mode`: that is the directive's own word for where an action works.
    select(
      'as',
      'Captions as',
      [
        ['words', 'Words as they are spoken'],
        ['phrases', 'Phrases as title clips'],
      ],
      'words',
      'Words are switched on for the clips that speak and follow every later cut; title clips ' +
        'are text of their own.',
    ),
    select(
      'preset',
      'Look',
      [
        ['auto', 'As described — or as the timeline has it'],
        ['clean', 'Clean'],
        ['pop', 'Pop'],
        ['karaoke', 'Karaoke'],
        ['boxed', 'Boxed'],
        ['minimal', 'Minimal'],
      ],
      'auto',
      'For words: one of the caption presets. Fine-tune it in Inspector ▸ Captions.',
    ),
    toggle(
      'useLlm',
      'Let the LLM choose the look',
      false,
      'Asked only when the description names no look; it picks among the presets.',
    ),
    range('maxChars', 'Characters per caption', [12, 80, 1], 36, '', PHRASES_ONLY),
    range('maxDuration', 'Longest caption', [1, 8, 0.5], 4, 's', PHRASES_ONLY),
    select('position', 'Position', ['bottom', 'middle', 'top'], 'bottom', PHRASES_ONLY),
    select('size', 'Size', ['small', 'medium', 'large'], 'medium', PHRASES_ONLY),
    toggle('background', 'Box behind the text', false, PHRASES_ONLY),
  ],
};
