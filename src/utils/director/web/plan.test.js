import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { ACTIONS, getAction } from '#utils/director/actions.js';
import { SITE_DEMO } from '#utils/director/actionsWeb.js';
import { normalizeDirective } from '#utils/director/directive.js';
import { themeIds } from '#utils/director/motion/themes.js';
import { STEP_KINDS, stepKind } from '#utils/web/index.js';
import { HOME_PAGE } from '../../../api/director/web/testing/page.js';
import { pageDigest, pageGroups } from './digest.js';
import {
  DEMO_KINDS,
  DEMO_PLAN_EXAMPLE,
  DEMO_PLAN_SCHEMA,
  DEMO_VERBS,
  LEFT_OUT,
  WORD_PARAM,
  stopNeeds,
  stopProblem,
} from './planSchema.js';

const validate = new Ajv({ allErrors: true }).compile(DEMO_PLAN_SCHEMA);
const SEEN = {
  url: 'https://tideline.test/',
  title: 'Tideline — changelogs people read',
  viewport: { width: 1280, height: 720 },
  page: { width: 1280, height: 2516 },
  elements: [...HOME_PAGE],
};

test('the kinds of stop are the recipe library’s own, minus what nobody asks a demo for', () => {
  assert.deepEqual(
    DEMO_VERBS,
    STEP_KINDS.map((kind) => kind.do).filter((name) => !LEFT_OUT.includes(name)),
  );
  assert.deepEqual([...DEMO_VERBS].sort(), [
    'click',
    'focus',
    'goto',
    'highlight',
    'hover',
    'press',
    'scroll',
    'select',
    'type',
    'wait',
  ]);
  assert.ok(!DEMO_VERBS.includes('run'), 'a plan can never carry a script');
  for (const name of LEFT_OUT) assert.ok(stepKind(name), `${name} is a step kind`);
  assert.equal(DEMO_KINDS.length, DEMO_VERBS.length);
  // Every parameter a stop's text fills exists in its kind — or is the step's own duration.
  for (const [verb, param] of Object.entries(WORD_PARAM)) {
    assert.ok(DEMO_VERBS.includes(verb), verb);
    assert.ok(stepKind(verb).params[param] || param === 'duration', `${verb}.${param}`);
  }
});

test('what each kind of stop needs follows from the step table', () => {
  const needs = Object.fromEntries(DEMO_VERBS.map((verb) => [verb, stopNeeds(verb)]));
  const on = DEMO_VERBS.filter((verb) => needs[verb].on).sort();
  const text = DEMO_VERBS.filter((verb) => needs[verb].text).sort();
  assert.deepEqual(on, ['click', 'focus', 'highlight', 'hover', 'scroll', 'select']);
  assert.deepEqual(text, ['goto', 'press', 'select', 'type']);
  assert.deepEqual([needs.type.aims, needs.wait.aims, needs.press.aims], [true, false, false]);
  assert.equal(stopProblem({ do: 'click', on: 'Pricing' }), '');
  assert.equal(stopProblem({ do: 'type', text: 'hi' }), '');
  assert.equal(stopProblem({ do: 'wait' }), '');
  assert.match(
    stopProblem({ do: 'click' }),
    /^click needs "on": the name of the thing on the page$/,
  );
  assert.match(stopProblem({ do: 'hover', on: '  ' }), /needs "on"/);
  assert.match(stopProblem({ do: 'type', on: 'Email' }), /^type needs "text": the text$/);
  assert.match(stopProblem({ do: 'press' }), /^press needs "text": the key$/);
  assert.match(stopProblem({ do: 'goto' }), /^goto needs "text": the address$/);
  assert.match(stopProblem({ do: 'select', on: 'Plan' }), /^select needs "text": the option$/);
});

test('the plan schema accepts the example and rejects what a plan may not hold', () => {
  assert.equal(validate(DEMO_PLAN_EXAMPLE), true, JSON.stringify(validate.errors));
  for (const stop of DEMO_PLAN_EXAMPLE.stops) assert.equal(stopProblem(stop), '');
  assert.equal(validate({ stops: [{ do: 'wait' }] }), true);
  const bad = [
    {},
    { stops: [] },
    { stops: [{ on: 'Pricing' }] },
    { stops: [{ do: 'run', text: 'alert(1)' }] },
    { stops: [{ do: 'click', on: 7 }] },
    { stops: [{ do: 'click', on: 'x'.repeat(121) }] },
    { stops: Array.from({ length: 41 }, () => ({ do: 'wait' })) },
    { title: 5, stops: [{ do: 'wait' }] },
  ];
  for (const plan of bad) assert.equal(validate(plan), false, JSON.stringify(plan).slice(0, 60));
});

test('the page digest lists what is on the page under its headings — names only', () => {
  const groups = pageGroups(SEEN.elements, SEEN.viewport);
  assert.deepEqual(
    groups.map((group) => group.heading),
    ['', 'Changelogs people actually read', 'Features', 'Pricing', 'Create your account'],
  );
  assert.deepEqual(groups[0].entries, [
    'link "Features"',
    'link "Pricing"',
    'link "Docs"',
    'link "Sign in"',
  ]);
  assert.ok(
    groups[3].entries.includes('section "Pro plan"') &&
      groups[3].entries.includes('button "Yearly"'),
  );
  assert.ok(
    !groups.flatMap((group) => group.entries).includes('section "Pricing"'),
    'a section is its heading',
  );
  const { text, shown, total } = pageDigest(SEEN);
  assert.match(
    text,
    /^"Tideline — changelogs people read" — https:\/\/tideline\.test\/ — seen 1280 × 720, 2516 px tall\n\(top of the page\)\n {2}link "Features"/,
  );
  assert.match(text, /\nheading "Pricing"\n {2}button "Monthly"\n {2}button "Yearly"\n/);
  assert.equal(shown, total);
  assert.equal(total, 30);
  for (const leak of ['#pricing', 'text=', 'label=', 'aria-label', '1211'])
    assert.ok(!text.includes(leak), leak);
});

test('a long page is trimmed to the budget: headings stay, groups say what was left out', () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    ...{ kind: 'link', name: `Article number ${i}`, target: `text=Article number ${i}` },
    rect: { x: 0, y: 900 + i * 30, width: 100, height: 20 },
  }));
  const seen = { ...SEEN, elements: [...HOME_PAGE.slice(0, 11), ...many] };
  const whole = pageDigest(seen, 100000);
  assert.equal(whole.shown, whole.total);
  const cut = pageDigest(seen, 1500);
  assert.ok(cut.text.length < 1700 && cut.shown < cut.total);
  assert.match(cut.text, /heading "Features"\n(?: {2}.*\n)+ {2}… and \d+ more/);
  const tiny = pageDigest(seen, 300);
  assert.match(tiny.text, /\(… the page goes on: \d+ more lines not shown\)$/);
  assert.equal(pageDigest({ ...SEEN, elements: [] }).total, 0);
});

test('the action schema offers what can be built', () => {
  assert.equal(getAction('site_demo'), SITE_DEMO);
  assert.ok(ACTIONS.indexOf(SITE_DEMO) === ACTIONS.findIndex((a) => a.id === 'motion_piece') + 1);
  assert.deepEqual(
    [SITE_DEMO.llm, SITE_DEMO.media, SITE_DEMO.prompt.required],
    ['optional', false, false],
  );
  assert.ok(SITE_DEMO.noLlmNote);
  assert.deepEqual(
    SITE_DEMO.fields.map((field) => [field.key, field.type]),
    [
      ...[
        ['url', 'text'],
        ['look', 'select'],
        ['theme', 'select'],
        ['size', 'select'],
      ],
      ...[
        ['pacing', 'select'],
        ['duration', 'range'],
        ['zoom', 'toggle'],
        ['captions', 'toggle'],
      ],
      ...[
        ['title', 'text'],
        ['finished', 'toggle'],
        ['useLlm', 'toggle'],
      ],
    ],
  );
  const options = (key) =>
    SITE_DEMO.fields.find((field) => field.key === key).options.map((o) => o.value);
  assert.deepEqual(options('theme'), ['brand', 'auto', ...themeIds()]);
  assert.deepEqual(options('look'), ['window', 'full']);
  assert.equal(options('size')[0], 'auto');
  const normal = normalizeDirective({
    action: 'site_demo',
    params: { url: ' https://example.com ' },
  });
  assert.equal(normal.ok, true);
  assert.deepEqual(normal.directive.params, {
    ...{
      url: 'https://example.com',
      look: 'window',
      theme: 'brand',
      size: 'auto',
      pacing: 'medium',
    },
    ...{ duration: 0, zoom: true, captions: true, title: '', finished: false, useLlm: false },
  });
  assert.equal(normal.directive.mode, 'replace');
  const wrong = normalizeDirective({ action: 'site_demo', params: { look: 'tv', size: 'huge' } });
  assert.deepEqual(Object.keys(wrong.fields), ['params.look', 'params.size']);
});
