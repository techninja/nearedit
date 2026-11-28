/**
 * Action schema of `motion_piece`: a piece built only from generated
 * layers — no media. The themes and the particle choices are read from the
 * motion vocabularies, so the form always offers what can be built.
 * Reference: docs/app-spec/DIRECTOR-MOTION.md. Isomorphic, pure data.
 * @module utils/director/actionsMotion
 */

import { BRAND } from './brand/theme.js';
import { PACING, range, select, toggle } from './fields.js';
import { AUTO, THEMES } from './motion/themes.js';
import { NONE, PARTICLE_PRESETS } from './motion/vocab.js';

/** @type {import('./actions.js').ActionSchema} */
export const MOTION_PIECE = {
  id: 'motion_piece',
  title: 'Motion piece',
  description:
    'A title sequence made only of generated layers — animated backgrounds, particles, ' +
    'shapes and titles — from a few lines of text. No media files needed.',
  brand: 'Follows the brand kit: its colours, fonts and motion, its intro, chapter and outro.',
  llm: 'optional',
  noLlmNote: 'Builds the scenes from the lines of the brief; the language model is not available.',
  media: false,
  jobType: 'director',
  modes: ['replace', 'append', 'prepend', 'insert', 'range'],
  defaultMode: 'replace',
  inPlace: false,
  prompt: {
    label: 'The brief: one line per scene',
    placeholder: 'Made from nothing | no footage, only layers\nEvery number can move\nStart here',
    required: false,
  },
  fields: [
    select(
      'theme',
      'Theme',
      [
        [BRAND, 'Brand — the project’s brand kit: its colours, fonts and motion'],
        [AUTO, 'Auto — one of the themes below, by the variation number'],
        ...THEMES.map(
          (theme) =>
            /** @type {[string, string]} */ ([theme.id, `${theme.label} — ${theme.description}`]),
        ),
      ],
      BRAND,
    ),
    range(
      'duration',
      'Target length',
      [0, 600, 1],
      0,
      's',
      '0 lets every scene stay as long as its text takes to read.',
    ),
    PACING,
    range(
      'seed',
      'Variation',
      [1, 99, 1],
      1,
      '',
      'The same brief and number always give the same piece; another number, another take.',
    ),
    select(
      'particles',
      'Particles',
      [
        [AUTO, 'Auto — as the theme has them'],
        [NONE, 'None'],
        ...PARTICLE_PRESETS.map(
          (preset) => /** @type {[string, string]} */ ([preset.id, preset.name || preset.id]),
        ),
      ],
      AUTO,
    ),
    toggle(
      'bumpers',
      'Open and close with the brand’s intro and outro',
      true,
      'With the Brand theme, the first scene is the kit’s intro and the last its outro. A ' +
        'line that begins “Chapter:” is its chapter card.',
    ),
    toggle(
      'useLlm',
      'Let the LLM write the scenes',
      false,
      'The brief is then a description of the piece; the language model writes the words ' +
        'and makes the choices. Without it, each line of the brief is a scene.',
    ),
  ],
};
