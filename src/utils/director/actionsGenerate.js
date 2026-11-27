/**
 * Action schemas for the actions that build new timeline material:
 * base_edit, generate_edit, generate_script, execute_script.
 * Isomorphic, pure data.
 * @module utils/director/actionsGenerate
 */

import { AUTO_BROLL, BEAT_SYNC, DURATION, NATURAL_SOUND, PACING, PADDING } from './fields.js';
import { SILENCE_THRESHOLD as PAUSE, TIGHTEN, range, select, text, toggle } from './fields.js';

/** Every placement a generated fragment supports (API.md § Director). */
export const ALL_MODES = ['replace', 'append', 'prepend', 'insert', 'range'];

const STYLE_IDEAS = [
  'highlight reel',
  'talking head with cutaways',
  'documentary',
  'tutorial / demo',
  'trailer',
  'vlog',
];

const STYLE = {
  ...select('style', 'Style', ['auto', ...STYLE_IDEAS], 'auto', 'Pick one or type your own.'),
  allowCustom: true,
};

/** @type {import('./actions.js').ActionSchema} */
export const BASE_EDIT = {
  id: 'base_edit',
  title: 'Base edit',
  description:
    'Automatic rough cut from analysed media, no AI: speech with dead air removed, ' +
    'b-roll by scene, stills with a slow move, music cut on the beat.',
  llm: 'no',
  jobType: 'director',
  modes: ALL_MODES,
  defaultMode: 'replace',
  inPlace: false,
  prompt: null,
  fields: [
    DURATION,
    select(
      'style',
      'Style',
      [
        ['auto', 'Auto — decide from the material'],
        ['talking_head', 'Talking head — speech leads'],
        ['montage', 'Montage — pictures lead'],
      ],
      'auto',
    ),
    PACING,
    TIGHTEN,
    PAUSE,
    PADDING,
    toggle(
      'music',
      'Add a music bed',
      true,
      'Uses a music file from the project when there is one.',
    ),
    BEAT_SYNC,
    AUTO_BROLL,
    NATURAL_SOUND,
    text('title', 'Opening title', 'Leave empty for none'),
  ],
};

/** @type {import('./actions.js').ActionSchema} */
export const GENERATE_EDIT = {
  id: 'generate_edit',
  title: 'Generate edit',
  description:
    'The LLM chooses what to use — files, parts, order, titles — and the timeline is ' +
    'assembled deterministically on word, scene and beat boundaries.',
  llm: 'yes',
  jobType: 'director',
  modes: ALL_MODES,
  defaultMode: 'replace',
  inPlace: false,
  prompt: {
    label: 'What should the edit be?',
    placeholder: '60 second highlight reel of the kids at the park, cut to the beat',
    required: false,
  },
  fields: [DURATION, STYLE, PACING, TIGHTEN, PAUSE, PADDING, BEAT_SYNC, AUTO_BROLL, NATURAL_SOUND],
};

/** @type {import('./actions.js').ActionSchema} */
export const GENERATE_SCRIPT = {
  id: 'generate_script',
  title: 'Generate script',
  description:
    'The LLM writes edit-script options as Markdown files in the project’s scripts/ folder ' +
    'for you to review and edit before anything touches the timeline.',
  llm: 'yes',
  jobType: 'script',
  modes: [],
  defaultMode: '',
  inPlace: false,
  prompt: {
    label: 'What is the video about?',
    placeholder: 'A two minute recap of the workshop for people who missed it',
    required: false,
  },
  fields: [DURATION, STYLE, PACING, range('variants', 'Options to write', [1, 5, 1], 3)],
};

/** @type {import('./actions.js').ActionSchema} */
export const EXECUTE_SCRIPT = {
  id: 'execute_script',
  title: 'Execute script',
  description: 'Build the timeline from an approved edit script.',
  llm: 'yes',
  jobType: 'director',
  modes: ALL_MODES,
  defaultMode: 'replace',
  inPlace: false,
  prompt: {
    label: 'Script',
    placeholder: 'Paste the approved script here, or choose a script file below',
    required: false,
  },
  fields: [
    {
      key: 'scriptPath',
      type: 'file',
      label: 'Script file',
      help: 'A Markdown script from the project. Used when the script box is empty.',
      default: '',
      accept: 'text',
    },
    TIGHTEN,
    PAUSE,
    PADDING,
    BEAT_SYNC,
    AUTO_BROLL,
    NATURAL_SOUND,
  ],
};
