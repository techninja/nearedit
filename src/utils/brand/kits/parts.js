/**
 * Building blocks for writing the built-in kits: the references a design
 * uses instead of values, the standard elements' heads (kind, length,
 * slots), and the logo as layers. Everything here returns plain data — a
 * built-in kit is an ordinary kit. Isomorphic and pure.
 * @module utils/brand/kits/parts
 */

/** @type {(name: string) => string} A slot reference. */
export const slot = (name) => `{slot.${name}}`;

/** Colour tokens, by role. Followed by two hex digits a reference is that colour with an alpha. */
export const C = Object.freeze({
  background: '{color.background}',
  surface: '{color.surface}',
  primary: '{color.primary}',
  accent: '{color.accent}',
  text: '{color.text}',
  muted: '{color.muted}',
  onPrimary: '{color.onPrimary}',
  onAccent: '{color.onAccent}',
});

/** Font tokens. */
export const F = Object.freeze({ heading: '{font.heading}', body: '{font.body}' });

/** Shape, spacing and motion tokens. */
export const T = Object.freeze({
  radius: '{shape.radius}',
  stroke: '{shape.stroke}',
  gap: '{space.gap}',
  margin: '{space.margin}',
  enter: '{motion.enter}',
  exit: '{motion.exit}',
});

/** The logo tokens of a kit that has no logo file: its mark is drawn. */
export const NO_LOGO = Object.freeze({ main: '', mark: '', initials: '' });

/** The standard elements every complete kit defines (BRAND.md § Elements). */
const HEADS = {
  'lower-third': {
    label: 'Lower third',
    kind: 'overlay',
    duration: 5,
    minDuration: 1.5,
    slots: {
      name: { label: 'Name', sample: 'Ada Lovelace', max: 120 },
      role: { label: 'Role', sample: 'Mathematician', optional: true, max: 160 },
    },
  },
  title: {
    label: 'Title',
    kind: 'overlay',
    duration: 5,
    minDuration: 1.5,
    slots: {
      title: { label: 'Title', sample: 'A title worth reading', max: 160, lines: 2 },
      subtitle: { label: 'Subtitle', sample: 'And a line under it', optional: true, max: 200 },
    },
  },
  caption: {
    label: 'Caption',
    kind: 'overlay',
    duration: 3,
    minDuration: 0.4,
    slots: {
      text: { label: 'Text', sample: 'One line of what is being said', max: 300, lines: 2 },
    },
  },
  quote: {
    label: 'Quote',
    kind: 'overlay',
    duration: 6,
    minDuration: 2,
    slots: {
      text: { label: 'Quote', sample: 'The more I study, the more insatiable I feel.', lines: 3 },
      by: { label: 'By', sample: 'Ada Lovelace', optional: true, max: 120 },
    },
  },
  chapter: {
    label: 'Chapter card',
    kind: 'segment',
    duration: 3,
    minDuration: 1.5,
    slots: {
      title: { label: 'Title', sample: 'How it began', max: 120, lines: 2 },
      number: { label: 'Number', sample: '01', optional: true, max: 12 },
    },
  },
  intro: {
    label: 'Intro',
    kind: 'segment',
    duration: 4,
    minDuration: 2,
    slots: {
      title: { label: 'Title', sample: 'The Analytical Engine', max: 120, lines: 2 },
      subtitle: { label: 'Subtitle', sample: 'A short history', optional: true, max: 160 },
    },
  },
  outro: {
    label: 'Outro',
    kind: 'segment',
    duration: 5,
    minDuration: 2,
    slots: {
      title: { label: 'Title', sample: 'Thanks for watching', max: 120, lines: 2 },
      text: { label: 'Text', sample: 'More at example.com', optional: true, max: 200, lines: 2 },
    },
  },
  bug: { label: 'Logo bug', kind: 'overlay', duration: 10, minDuration: 1, slots: {} },
  stinger: {
    label: 'Stinger',
    kind: 'transition',
    duration: 1.2,
    minDuration: 0.6,
    cover: 0.5,
    slots: {},
  },
};

/** The ids of the standard elements. */
export const STANDARD_ELEMENTS = Object.freeze(Object.keys(HEADS));

/** The defaults every built-in kit starts from: role → element. */
export const STANDARD_DEFAULTS = Object.freeze({
  lowerThird: 'lower-third',
  title: 'title',
  captions: 'caption',
  quote: 'quote',
  chapter: 'chapter',
  intro: 'intro',
  outro: 'outro',
  bug: 'bug',
  transition: 'stinger',
});

/**
 * A standard element: its head with a kit's own groups, layers and formats.
 * @param {keyof typeof HEADS} id
 * @param {Record<string, any>} body - `groups`, `layers`, `formats`, and
 *   anything of the head to change (`duration`, `cover`…)
 * @returns {Record<string, any>}
 */
export const element = (id, body) => ({ ...HEADS[id], ...body });
