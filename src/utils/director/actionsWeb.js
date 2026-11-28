/**
 * Action schema of `site_demo`: a demo of a web page — recorded by the web
 * clip recorder from an address and a few plain lines — with zooms,
 * captions and a background. The themes are the motion piece's, the page
 * sizes the web clip editor's, so the form offers what can be built.
 * Reference: docs/app-spec/DIRECTOR-WEB.md. Isomorphic, pure data.
 * @module utils/director/actionsWeb
 */

import { PACING, range, select, text, toggle } from './fields.js';
import { BRAND } from './brand/theme.js';
import { AUTO, THEMES } from './motion/themes.js';
import { SIZE_CHOICES } from './web/sizes.js';

/** The looks of a site demo. */
export const LOOKS = /** @type {const} */ (['window', 'full']);

/** @type {import('./actions.js').ActionSchema} */
export const SITE_DEMO = {
  id: 'site_demo',
  title: 'Site demo',
  description:
    'A demo of a web page: the page is recorded as it is scrolled, clicked and typed into, ' +
    'then framed with zooms on what matters, captions and a background. From an address ' +
    'and a few plain lines — or no lines at all, for a tour of the page.',
  brand: 'Follows the brand kit: its colours on the ground, its caption element, its intro.',
  llm: 'optional',
  noLlmNote: 'Reads the brief line by line as instructions; the language model is not available.',
  media: false,
  jobType: 'director',
  modes: ['replace', 'append', 'prepend', 'insert', 'range'],
  defaultMode: 'replace',
  inPlace: false,
  prompt: {
    label: 'What to show: one line per step (empty = a tour of the page)',
    placeholder:
      'click Pricing | plans for every team\nclick Yearly — two months free\n' +
      'highlight the Pro plan\ntype hello@example.com into Email | sign up in seconds',
    required: false,
  },
  fields: [
    text(
      'url',
      'Page address',
      'https://example.com',
      'Required. The page to record, starting with http:// or https://.',
    ),
    select(
      'look',
      'Look',
      [
        ['window', 'Window — the page as a window over a background'],
        ['full', 'Full frame — the page fills the picture'],
      ],
      'window',
    ),
    select(
      'theme',
      'Theme',
      [
        [BRAND, 'Brand — the project’s brand kit: its colours, captions and intro'],
        [AUTO, 'Auto — a ground that suits the page'],
        ...THEMES.map(
          (theme) =>
            /** @type {[string, string]} */ ([theme.id, `${theme.label} — ${theme.description}`]),
        ),
      ],
      BRAND,
      'Colours of the background, the captions and the title card.',
    ),
    select('size', 'Page size', [...SIZE_CHOICES], 'auto'),
    PACING,
    range(
      'duration',
      'Target length',
      [0, 600, 1],
      0,
      's',
      '0 lets the steps and their captions take the time they take.',
    ),
    toggle(
      'zoom',
      'Zoom in on clicks and typing',
      true,
      'The picture moves closer to what is clicked and typed into. "zoom in on …" always zooms.',
    ),
    toggle(
      'captions',
      'Show captions',
      true,
      'What follows " | " on a line, shown while it happens.',
    ),
    text(
      'title',
      'Title card',
      '',
      'Shown before the recording. Empty = none; a "# …" line of the brief sets it too.',
    ),
    toggle(
      'finished',
      'A finished piece: intro, outro and logo',
      false,
      'With the Brand theme: the kit’s intro before the recording, its outro after it and ' +
        'its logo bug over it.',
    ),
    toggle(
      'useLlm',
      'Let the LLM plan the demo',
      false,
      'The brief is then a description of what to show; the language model reads the page ' +
        'and writes the steps. Without it, each line of the brief is one step.',
    ),
  ],
};
