/**
 * The demo plan — the small JSON that says what a site demo shows, the same
 * whether the lines of a brief or a language model wrote it: an optional
 * title and a list of stops, each one thing to do on the page. A stop names
 * what it acts on the way a person would say it ("Pricing", "the Email
 * field"); it never carries a selector, a coordinate or a time — matching
 * names to the page and all timing are the builder's work.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § The demo plan.
 * Isomorphic, pure data.
 * @module utils/director/web/planSchema
 */

import { STEP_KINDS, stepKind } from '#utils/web/stepKinds.js';

/** Step kinds nobody asks a demo for: `move` is a hover, the other two show nothing. */
export const LEFT_OUT = Object.freeze(['move', 'hide', 'run']);

/** The step kinds a stop may ask for — the recipe's own table, minus `LEFT_OUT`. */
export const DEMO_KINDS = Object.freeze(STEP_KINDS.filter((kind) => !LEFT_OUT.includes(kind.do)));

/** @type {readonly string[]} What a stop's `do` may be. */
export const DEMO_VERBS = Object.freeze(DEMO_KINDS.map((kind) => kind.do));

/** Most stops a plan may hold. */
export const MAX_STOPS = 40;
/** Longest name, text and caption of a stop, and longest title, characters. */
export const MAX_ON = 120;
export const MAX_TEXT = 500;
export const MAX_SAY = 140;
export const MAX_TITLE = 120;

/**
 * The parameter of a step that a stop's `text` fills, by kind: what is
 * typed, the key, the option, the address, the highlight's style, the
 * seconds to wait, the pixels to scroll by.
 * @type {Readonly<Record<string, string>>}
 */
export const WORD_PARAM = Object.freeze({
  type: 'text',
  press: 'key',
  select: 'value',
  goto: 'url',
  highlight: 'style',
  wait: 'duration',
  scroll: 'by',
});

/** Words a `scroll` stop may name instead of something on the page. */
export const SCROLL_WORDS = Object.freeze(['top', 'bottom', 'down', 'up']);

/**
 * What a stop of a kind must say.
 * @param {string} verb - A stop's `do`
 * @returns {{ on: boolean, text: boolean, aims: boolean }} `on`, `text`:
 *   required; `aims`: the kind can aim at something at all
 */
export function stopNeeds(verb) {
  const kind = stepKind(verb);
  const params = kind?.params || {};
  const target = params.target || params.to;
  const word = params[WORD_PARAM[verb]];
  return {
    on: Boolean(params.target?.required || kind?.oneOf?.includes('to')),
    // An option is the whole point of a `select`, though the table lets it be empty.
    text: Boolean(word?.required) || verb === 'select',
    aims: Boolean(target),
  };
}

/**
 * What is wrong with a stop beyond its shape.
 * @param {{ do: string, on?: string, text?: string }} stop - Valid against `STOP_SCHEMA`
 * @returns {string} '' when it can be played
 */
export function stopProblem(stop) {
  const needs = stopNeeds(stop.do);
  if (needs.on && !stop.on?.trim())
    return `${stop.do} needs "on": the name of the thing on the page`;
  if (needs.text && !stop.text?.trim()) {
    const what = stepKind(stop.do).params[WORD_PARAM[stop.do]].label.toLowerCase();
    return `${stop.do} needs "text": the ${what}`;
  }
  return '';
}

/** One stop: what to do, on what, with which text, and the caption shown meanwhile. */
export const STOP_SCHEMA = {
  type: 'object',
  required: ['do'],
  properties: {
    do: { type: 'string', enum: [...DEMO_VERBS] },
    on: { type: 'string', maxLength: MAX_ON },
    text: { type: 'string', maxLength: MAX_TEXT },
    say: { type: 'string', maxLength: MAX_SAY },
  },
};

export const DEMO_PLAN_SCHEMA = {
  $id: 'https://nearedit.local/schemas/demo-plan.json',
  title: 'DemoPlan',
  type: 'object',
  required: ['stops'],
  properties: {
    title: { type: 'string', maxLength: MAX_TITLE },
    stops: { type: 'array', minItems: 1, maxItems: MAX_STOPS, items: STOP_SCHEMA },
  },
};

/** A small valid plan, shown to the LLM and used in the docs. */
export const DEMO_PLAN_EXAMPLE = {
  title: 'Pricing in ten seconds',
  stops: [
    { do: 'scroll', on: 'Pricing', say: 'Plans for every team' },
    { do: 'click', on: 'Yearly', say: 'Two months free when you pay yearly' },
    { do: 'highlight', on: 'the Pro plan' },
    { do: 'type', on: 'Email', text: 'hello@example.com', say: 'Sign up in seconds' },
    { do: 'press', text: 'Enter' },
  ],
};
