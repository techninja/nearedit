/**
 * Action schema of `brand` — "Apply brand": one step that dresses the open
 * timeline in the project's brand kit. It works on the whole timeline, so
 * it has no placement to choose.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic, pure data.
 * @module utils/director/actionsBrand
 */

import { text, toggle } from './fields.js';

/** @type {import('./actions.js').ActionSchema} */
export const BRAND_PASS = {
  id: 'brand',
  title: 'Apply brand',
  run: 'Apply brand',
  description:
    'Dress the timeline in the project’s brand kit: its intro and outro, its logo over the ' +
    'piece, a name for each speaker, a stinger at named markers, its caption style — and ' +
    'element clips brought up to date. Running it again changes only what is new.',
  brand: 'Places the brand kit’s own elements; run it again after the kit or the edit changes.',
  llm: 'optional',
  noLlmNote:
    'Matches the speakers to the files that speak in the order they are named; the ' +
    'language model is not available.',
  jobType: 'director',
  modes: [],
  defaultMode: 'replace',
  inPlace: true,
  shown: 3,
  prompt: {
    label: 'Anything else (optional): chapters, single elements, parts to leave out',
    placeholder:
      'chapters: Arrival; The river at 1:05; Home\nlower third: Ada Lovelace, CEO, at 0:12\nno stingers',
    required: false,
  },
  fields: [
    text('title', 'Title', 'The project’s name', 'On the intro and the outro.'),
    text('subtitle', 'Subtitle', '', 'A second line on the intro.'),
    text(
      'speakers',
      'Speakers',
      'Ada Lovelace — CEO; Grace Hopper — Rear Admiral',
      'Each gets a lower third where they first speak. Without the language model the ' +
        'first name goes to the first file that speaks, and so on; “… at 0:12” fixes a time.',
    ),
    toggle(
      'intro',
      'Intro before the first picture',
      true,
      'Everything else moves later by its length.',
    ),
    toggle('outro', 'Outro after the last picture', true),
    toggle('bug', 'Logo bug over the piece', true),
    toggle('names', 'Lower thirds for the speakers', true),
    toggle(
      'stingers',
      'Stingers and chapter cards',
      true,
      'A stinger on the cut at each named marker; a card for each chapter the brief lists.',
    ),
    toggle('captions', 'Caption style from the kit', true),
    toggle('restyle', 'Update elements that are out of date', true),
    toggle(
      'useLlm',
      'Let the LLM read who speaks where',
      false,
      'The language model reads the transcripts for who speaks in which file and where ' +
        'they introduce themselves. It never chooses a time.',
    ),
  ],
};
