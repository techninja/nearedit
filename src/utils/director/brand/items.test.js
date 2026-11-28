import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { builtinKit, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { PLAN_EXAMPLE, PLAN_SCHEMA } from '../planSchema.js';
import { elementClip, elementFor } from './elementClip.js';
import { ITEM_EXAMPLE, ITEM_SCHEMA, normalizeItem, resolveItem } from './items.js';
import { clock, parseLine, splitSlots } from './line.js';
import { findElement, kitMenu } from './menu.js';

const kit = resolveKit(builtinKit('clean'));
const validate = new Ajv({ allErrors: true }).compile(ITEM_SCHEMA);
const read = (raw) => {
  const item = normalizeItem(raw);
  assert.ok(validate(item), JSON.stringify(validate.errors));
  return resolveItem(item, kit);
};

test('a line names an element the way one would say it', () => {
  assert.deepEqual(read('lower third: Ada Lovelace, CEO, at 0:12'), {
    ...{ id: 'lower-third', kind: 'overlay', label: 'Lower third' },
    ...{ slots: { name: 'Ada Lovelace', role: 'CEO' }, at: 12, pick: null, duration: null },
  });
  assert.deepEqual(read('chapter: The river at 1:05').slots, { title: 'The river' });
  assert.equal(read('chapter: The river at 1:05').at, 65);
  assert.deepEqual(read('title: A Day at the Park | and what we found').slots, {
    title: 'A Day at the Park',
    subtitle: 'and what we found',
  });
  assert.deepEqual(read('Title: Hello, world').slots, { title: 'Hello, world' }, 'a comma is text');
  assert.deepEqual(read('quote: “The more I study” — Ada').slots, {
    text: 'The more I study',
    by: 'Ada',
  });
  assert.deepEqual([read('stinger at 0:30').id, read('stinger at 0:30').at], ['stinger', 30]);
  assert.deepEqual([read('- logo wipe at 75').id, read('2. Bug').id], ['stinger', 'bug']);
  assert.equal(read('fireworks: lots'), null, 'the kit has no such element');
});

test('times, lines and slots are read strictly', () => {
  assert.deepEqual(['0:12', '1:05', '1:00:05', '75', '12.5s', 12, '', 'soon', -1].map(clock), [
    12,
    65,
    3605,
    75,
    12.5,
    12,
    null,
    null,
    null,
  ]);
  assert.deepEqual(parseLine('  lower third:  Ada,  CEO  at 0:12 '), {
    ...{ name: 'lower third', rest: 'Ada, CEO', at: 12 },
  });
  assert.deepEqual(parseLine('Meet me at the station'), {
    ...{ name: 'Meet me at the station', rest: '', at: null },
  });
  assert.equal(parseLine('   '), null);
  assert.deepEqual(splitSlots('A | B | C', ['title', 'subtitle']), {
    title: 'A',
    subtitle: 'B, C',
  });
  assert.deepEqual(splitSlots('Ada', ['name', 'role']), { name: 'Ada' });
  assert.deepEqual(splitSlots('anything', []), {});
});

test('an item written by a model is forgiven its harmless ways', () => {
  const flat = read({ type: 'Lower Third', name: 'Ada', role: 'CEO', over: 'pick 2' });
  assert.deepEqual(
    [flat.id, flat.slots, flat.pick],
    ['lower-third', { name: 'Ada', role: 'CEO' }, 2],
  );
  const timed = read({
    element: 'intro',
    slots: { title: 'Park', shout: 'no such slot' },
    at: '0:03',
  });
  assert.deepEqual([timed.slots, timed.at], [{ title: 'Park' }, 3]);
  assert.deepEqual(read(ITEM_EXAMPLE).slots, { name: 'Ada Lovelace', role: 'Park ranger' });
  for (const bad of [{ slots: {} }, { element: '' }, { element: 'title', at: -1 }, 7, null]) {
    assert.equal(validate(normalizeItem(bad)), false, JSON.stringify(bad));
  }
  // The edit plan carries them, and its example is valid.
  const plan = new Ajv().compile(PLAN_SCHEMA);
  assert.ok(plan(PLAN_EXAMPLE));
  assert.deepEqual(PLAN_EXAMPLE.elements, [ITEM_EXAMPLE]);
});

test('an element is found by id, label, role or a common word; a kit’s defaults decide', () => {
  for (const [word, id] of [
    ...[
      ['lower-third', 'lower-third'],
      ['Lower third', 'lower-third'],
      ['lowerThird', 'lower-third'],
    ],
    ...[
      ['name plate', 'lower-third'],
      ['Chapter card', 'chapter'],
      ['logo', 'bug'],
      ['end card', 'outro'],
    ],
    ...[
      ['wipe', 'stinger'],
      ['opening', 'intro'],
      ['', ''],
      ['pizza', ''],
    ],
  ]) {
    assert.equal(findElement(kit, word), id, word);
  }
  // A kit that names its own element for a role: the role's words mean that one.
  const own = resolveKit([
    normalizeKit({
      id: 'acme',
      elements: { badge: { ...builtinKit('clean').elements['lower-third'], label: 'Badge' } },
      defaults: { lowerThird: 'badge' },
    }),
  ]);
  assert.equal(elementFor(own, 'lowerThird'), 'badge');
  assert.equal(findElement(own, 'lower third'), 'badge');
  assert.equal(findElement(own, 'lower-third'), 'lower-third', 'an id is still an id');
  assert.deepEqual(
    kitMenu(kit).map((entry) => `${entry.id}:${entry.kind}(${entry.needs})`),
    [
      ...['lower-third:overlay(name)', 'title:overlay(title)', 'caption:overlay(text)'],
      ...['quote:overlay(text)', 'chapter:segment(title)', 'intro:segment(title)'],
      ...['outro:segment(title)', 'bug:overlay()', 'stinger:transition()'],
    ],
  );
});

test('an element clip is made as the editor makes one', () => {
  const at = { fps: 30, width: 1920, height: 1080, startF: 30, endF: 120 };
  const clip = elementClip(kit, 'lower-third', { name: 'Ada', nope: 'x' }, at, {
    ...{ fadeOut: 0.2, transform: { y: -40 } },
  });
  assert.deepEqual([clip.timelineStart, clip.timelineEnd, clip.sourceOut], [1, 4, 3]);
  assert.deepEqual(clip.element.slots, { name: 'Ada' });
  assert.equal(clip.element.kit.id, 'clean');
  assert.deepEqual([clip.fadeOut, clip.transform.y, clip.transform.scaleX], [0.2, -40, 1]);
  assert.equal(elementClip(kit, 'fireworks', {}, at), null);
  assert.equal(elementClip(kit, 'bug', {}, { ...at, endF: 30 }), null, 'no length, no clip');
});
