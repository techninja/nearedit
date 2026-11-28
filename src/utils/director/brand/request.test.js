import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, resolveKit } from '#utils/brand/index.js';
import { coerceField, normalizeDirective } from '../directive.js';
import { BRAND_PASS } from '../actionsBrand.js';
import { readSpeaker } from './people.js';
import { PARTS, readBrandRequest } from './request.js';

const kit = resolveKit(builtinKit('clean'));
const read = (params, prompt = '') => readBrandRequest(params, prompt, kit);

test('the form’s title, subtitle and speakers are read as written', () => {
  const out = read({
    title: ' Park day ',
    subtitle: 'A short film',
    speakers: 'Ada Lovelace — CEO; Grace Hopper, Rear Admiral;  ; Linus (Kernel) at 0:40',
  });
  assert.deepEqual([out.title, out.subtitle, out.closing], ['Park day', 'A short film', null]);
  assert.deepEqual(out.speakers, [
    { name: 'Ada Lovelace', role: 'CEO', at: null },
    { name: 'Grace Hopper', role: 'Rear Admiral', at: null },
    { name: 'Linus', role: 'Kernel', at: 40 },
  ]);
  assert.deepEqual(out.parts, Object.fromEntries([...PARTS, 'chapters'].map((p) => [p, true])));
  for (const [text, speaker] of [
    ['Ada: CEO at 12s', { name: 'Ada', role: 'CEO', at: 12 }],
    ['- Bob', { name: 'Bob', role: '', at: null }],
    [
      'Dr. Maya Okafor - Flight director',
      { name: 'Dr. Maya Okafor', role: 'Flight director', at: null },
    ],
    ['Jean-Luc Picard', { name: 'Jean-Luc Picard', role: '', at: null }],
  ]) {
    assert.deepEqual(readSpeaker(text), speaker, text);
  }
  assert.equal(readSpeaker('  '), null);
});

test('the brief adds lists, single elements and what to leave out', () => {
  const out = read(
    { title: 'Park day', speakers: 'Ada — CEO' },
    [
      'Speakers: Grace Hopper — Rear Admiral',
      'chapters: Arrival; The river at 1:05; 3. Home',
      'lower third: Alan Turing, Codebreaker, at 0:12',
      'intro: A day at the park | told in a minute',
      'outro: Thanks for watching | example.com',
      'quote: Hello — me at 0:20',
      'chapter: Epilogue at 2:00',
      'no bug, no stingers',
      'gibberish here',
      'title: with no time',
    ].join('\n'),
  );
  assert.deepEqual([out.title, out.subtitle], ['A day at the park', 'told in a minute']);
  assert.deepEqual(out.closing, { title: 'Thanks for watching', text: 'example.com' });
  assert.deepEqual(
    out.speakers.map((s) => [s.name, s.role, s.at]),
    [
      ['Ada', 'CEO', null],
      ['Grace Hopper', 'Rear Admiral', null],
      ['Alan Turing', 'Codebreaker', 12],
    ],
  );
  assert.deepEqual(out.chapters, [
    { title: 'Arrival', at: null },
    { title: 'The river', at: 65 },
    { title: 'Home', at: null },
    { title: 'Epilogue', at: 120 },
  ]);
  assert.deepEqual(
    out.items.map((item) => [item.id, item.slots, item.at]),
    [['quote', { text: 'Hello', by: 'me' }, 20]],
  );
  assert.deepEqual([out.parts.bug, out.parts.stingers, out.parts.chapters], [false, false, true]);
  assert.deepEqual(out.notes, [
    '“gibberish here” was not understood — left out.',
    '“title: with no time” says no time (… at 0:12) — left out.',
  ]);
});

test('parts are switched off in the form or in plain words', () => {
  const form = read({ intro: false, stingers: false, captions: false });
  assert.deepEqual(
    Object.keys(form.parts).filter((part) => !form.parts[part]),
    ['intro', 'stingers', 'captions', 'chapters'],
    'the form’s switch for stingers is the chapter cards’ too',
  );
  for (const [words, part] of [
    ...[
      ['no intro', 'intro'],
      ['without the logo', 'bug'],
      ['skip lower thirds', 'names'],
    ],
    ...[
      ['No chapter cards.', 'chapters'],
      ['no caption style', 'captions'],
      ['no restyle', 'restyle'],
    ],
    ...[
      ['without an outro', 'outro'],
      ['no wipes', 'stingers'],
    ],
  ]) {
    const out = read({}, words);
    assert.equal(out.parts[part], false, words);
    assert.deepEqual(out.notes, [], words);
  }
  // A line that names the bug switches it on again; "no" needs a part to mean something.
  assert.equal(read({ bug: false }, 'bug').parts.bug, true);
  assert.deepEqual(read({}, 'no nonsense').notes, ['“no nonsense” was not understood — left out.']);
});

test('the action schema: a form for the whole timeline, every field usable', () => {
  assert.deepEqual(
    [BRAND_PASS.id, BRAND_PASS.title, BRAND_PASS.inPlace, BRAND_PASS.llm, BRAND_PASS.modes],
    ['brand', 'Apply brand', true, 'optional', []],
  );
  assert.deepEqual(
    BRAND_PASS.fields.map((field) => field.key),
    ['title', 'subtitle', 'speakers', ...PARTS, 'useLlm'],
  );
  assert.equal(BRAND_PASS.shown, 3, 'the words first, the switches under More options');
  assert.equal(BRAND_PASS.run, 'Apply brand', 'its button says what it does');
  assert.ok(BRAND_PASS.brand && BRAND_PASS.noLlmNote && BRAND_PASS.prompt.required === false);
  for (const field of BRAND_PASS.fields) {
    if (field.type === 'toggle')
      assert.deepEqual(coerceField(field, field.default), { value: field.default });
  }
  const normal = normalizeDirective({
    action: 'brand',
    params: { speakers: 'Ada — CEO', bug: 'false' },
  });
  assert.equal(normal.ok, true);
  assert.deepEqual(
    [normal.directive.mode, normal.directive.params.bug, normal.directive.params.intro],
    ['', false, true],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(BRAND_PASS)), BRAND_PASS);
});
