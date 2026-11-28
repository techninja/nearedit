/**
 * Action schema of `score`: music written for the timeline — a song in a
 * style, as long as the picture, changing where it changes, quieter under
 * speech — added as one music clip. The styles are read from the scoring
 * styles, so the form offers what can be written.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md. Isomorphic, pure data.
 * @module utils/director/actionsScore
 */

import { range, select, toggle } from './fields.js';
import { AUTO, STYLES } from './score/styles.js';

/** The keys the form offers: every pitch class once, as it is usually written. */
export const SCORE_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** @type {import('./actions.js').ActionSchema} */
export const SCORE = {
  id: 'score',
  title: 'Score',
  description:
    'Music written for this timeline: a song in a style, exactly as long as the picture, ' +
    'that changes at the markers, titles and cuts and steps back while someone speaks. It ' +
    'arrives as one music clip that can be opened and changed note by note.',
  llm: 'optional',
  noLlmNote:
    'Chooses the style and the arc from the timeline and the mood words of the brief; ' +
    'the language model is not available.',
  jobType: 'director',
  modes: ['replace', 'range'],
  defaultMode: 'replace',
  inPlace: true,
  prompt: {
    label: 'The brief (optional): the mood, a style',
    placeholder: 'calm, hopeful, picks up at the product reveal',
    required: false,
  },
  fields: [
    select(
      'style',
      'Style',
      [
        [AUTO, 'Auto — by the pace of the timeline and whether someone speaks'],
        ...STYLES.map(
          (style) =>
            /** @type {[string, string]} */ ([style.id, `${style.label} — ${style.description}`]),
        ),
      ],
      AUTO,
    ),
    range(
      'energy',
      'Energy',
      [0, 1, 0.05],
      0.5,
      '',
      'How much happens: 0 is a quiet bed, 1 uses everything the style has.',
    ),
    select(
      'key',
      'Key',
      [[AUTO, 'Auto — one the style sits well in'], ...SCORE_KEYS],
      AUTO,
      'Major or minor follows from the style.',
    ),
    range(
      'bpm',
      'Tempo',
      [0, 240, 1],
      0,
      'BPM',
      '0 fits a tempo of the style to the length, so the music ends with the picture.',
    ),
    range(
      'duck',
      'Quieter under speech by',
      [0, 24, 1],
      12,
      'dB',
      'How far the music steps back while someone speaks. 0 leaves it alone.',
    ),
    range('volume', 'Level', [0.05, 1.5, 0.05], 0.7, '', 'The music clip’s volume.'),
    range(
      'seed',
      'Variation',
      [1, 99, 1],
      1,
      '',
      'The same timeline and number always give the same music; another number, another take.',
    ),
    toggle(
      'useLlm',
      'Let the LLM plan the music',
      false,
      'The language model reads the brief and the shape of the timeline and chooses the ' +
        'style, the mood and the sections. It never writes a note.',
    ),
  ],
};
