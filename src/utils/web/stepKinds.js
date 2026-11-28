/**
 * The step kinds of a recipe, as data: what each does, its default timing
 * and its parameters. This table drives the step form, the director's
 * vocabulary, normalisation and validation — nothing about a step kind is
 * written down anywhere else. Isomorphic and pure.
 * @module utils/web/stepKinds
 */

import { EASINGS } from '#utils/edl/easing.js';
import { DEFAULT_EASE, RECIPE_LIMITS } from './limits.js';
import { aimed, choice, index, kind, number, target, text } from './stepParams.js';

/** @typedef {import('./types.js').StepParam} StepParam */
/** @typedef {import('./types.js').StepKind} StepKind */

/** How long a `type` step takes to reach its target before the first key. */
export const TYPE_APPROACH = 0.5;

/** Keys that may be held while a key is pressed. */
export const MODIFIERS = Object.freeze(['Alt', 'Control', 'Meta', 'Shift']);

/**
 * Every step kind, in the order a menu shows them. Timing is
 * `[duration, hold]` in seconds.
 * @type {readonly StepKind[]}
 */
export const STEP_KINDS = Object.freeze([
  kind('wait', 'Wait', 'The page plays on', [1, 0]),
  kind('move', 'Move', 'The cursor glides to the middle of the target', [0.7, 0.2], aimed),
  kind('hover', 'Hover', 'The cursor glides to the target and stays', [0.7, 1], aimed),
  kind(
    'click',
    'Click',
    'Glide, then press and release at the end of the glide',
    [0.7, 0.6],
    {
      ...aimed,
      button: choice('Button', ['left', 'middle', 'right']),
      count: number('Clicks', 1, 1, 3, { integer: true }),
    },
    { camera: 'clicks' },
  ),
  kind(
    'type',
    'Type',
    'Click the target if there is one, then type key by key: 0.5 s to get there + length / speed',
    [TYPE_APPROACH, 0.5],
    {
      text: text('Text', { required: true }),
      target: target({ required: false }),
      index,
      speed: number('Characters per second', 14, 1, 60),
      clear: { type: 'boolean', default: false, label: 'Clear the field first' },
    },
    { camera: 'clicks' },
  ),
  kind('press', 'Press a key', 'One key: Enter, Tab, Escape, ArrowDown, a…', [0.15, 0.4], {
    key: { type: 'key', default: 'Enter', label: 'Key', required: true },
    modifiers: {
      type: 'select',
      default: [],
      label: 'Held keys',
      options: MODIFIERS,
      multiple: true,
    },
  }),
  kind(
    'scroll',
    'Scroll',
    'The page scrolls smoothly — to a target, the top, the bottom or a position, or by a distance',
    [1, 0.4],
    {
      to: target({ label: 'To', required: false, options: ['top', 'bottom'], number: true }),
      index,
      by: number('By (pixels)', 0, -100000, 100000),
      align: choice('Align', ['start', 'center', 'end'], 'center'),
    },
    { oneOf: ['to', 'by'] },
  ),
  kind('select', 'Select', 'Glide to a <select> and choose an option', [0.7, 0.6], {
    ...aimed,
    value: text('Option'),
  }),
  kind(
    'highlight',
    'Highlight',
    'A ring around the target, or everything else dimmed; shown through the hold',
    [0.4, 1.5],
    {
      ...aimed,
      style: choice('Style', ['outline', 'spotlight']),
      color: text('Colour', { default: '#f59e0b', format: 'color' }),
    },
  ),
  kind(
    'focus',
    'Focus',
    'Nothing on the page — a camera cue: zoom in on the target',
    [0.6, 1.5],
    { ...aimed, zoom: number('Zoom (0 = fit)', 0, 0, 8) },
    { camera: 'always' },
  ),
  kind('goto', 'Go to', 'Navigate; the new page appears loaded', [0, 1], {
    url: text('Address', { required: true, format: 'url' }),
  }),
  kind('hide', 'Hide', 'Remove an element from view', [0, 0], aimed),
  kind('run', 'Run a script', 'Run JavaScript in the page', [0, 0.2], {
    js: { type: 'code', default: '', label: 'Script', required: true },
  }),
]);

/**
 * The fields every step may carry besides its kind's parameters. `duration`
 * and `hold` have no default of their own: left out, the kind's apply.
 * @type {Readonly<Record<string, StepParam>>}
 */
export const STEP_COMMON = Object.freeze({
  duration: number('Duration', 0, 0, RECIPE_LIMITS.seconds),
  hold: number('Hold', 0, 0, RECIPE_LIMITS.seconds),
  ease: choice('Easing', EASINGS, DEFAULT_EASE),
  note: text('Note'),
});

/**
 * @param {any} name - A step's `do`
 * @returns {StepKind|undefined} undefined for anything that is not a step kind
 */
export function stepKind(name) {
  return STEP_KINDS.find((entry) => entry.do === name);
}
