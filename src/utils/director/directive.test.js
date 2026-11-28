import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { ACTIONS, MODES, defaultParams, getAction } from './actions.js';
import { coerceField, normalizeDirective } from './directive.js';
import { LAYOUT, layoutOrder } from './layout.js';
import { PLAN_EXAMPLE, PLAN_SCHEMA } from './planSchema.js';

test('the action list matches the API.md table', () => {
  const llm = Object.fromEntries(ACTIONS.map((a) => [a.id, a.llm]));
  assert.deepEqual(llm, {
    base_edit: 'no',
    generate_edit: 'yes',
    generate_script: 'yes',
    execute_script: 'yes',
    insert_broll: 'optional',
    motion_piece: 'optional',
    site_demo: 'optional',
    score: 'optional',
    remove_silence: 'no',
    beat_sync: 'no',
    add_captions: 'optional',
    brand: 'optional',
  });
});

test('every action schema is complete, serialisable and self-consistent', () => {
  for (const action of ACTIONS) {
    assert.ok(action.title && action.description, action.id);
    assert.ok(['director', 'script'].includes(action.jobType));
    for (const mode of action.modes) assert.ok(MODES.includes(mode), `${action.id}: ${mode}`);
    if (action.modes.length) assert.ok(action.modes.includes(action.defaultMode), action.id);
    const keys = action.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${action.id}: duplicate field key`);
    for (const field of action.fields) {
      assert.ok(field.label, `${action.id}.${field.key}`);
      assert.notEqual(field.default, undefined);
      // A default must survive its own validation unchanged.
      if (field.default !== '')
        assert.deepEqual(coerceField(field, field.default), { value: field.default });
      if (field.type === 'range') assert.ok(field.min < field.max && field.step > 0);
      if (field.type === 'select') assert.ok(field.options.length >= 2);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(action)), action);
  }
  assert.equal(getAction('nope'), null);
  assert.equal(defaultParams('base_edit').duration, 60);
});

test('in-place actions need the timeline; generating actions place a fragment', () => {
  const inPlace = ACTIONS.filter((a) => a.inPlace).map((a) => a.id);
  assert.deepEqual(inPlace, ['score', 'remove_silence', 'beat_sync', 'add_captions', 'brand']);
  assert.deepEqual(getAction('brand').modes, [], 'the brand pass is for the whole timeline');
  assert.equal(getAction('insert_broll').defaultMode, 'insert');
  assert.deepEqual(getAction('generate_script').modes, []);
});

test('normalizeDirective fills defaults and records what was given', () => {
  const out = normalizeDirective({ action: 'base_edit', params: { duration: '30', title: '' } });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.directive.mode, 'replace');
  assert.equal(out.directive.params.duration, 30);
  assert.equal(out.directive.params.style, 'auto');
  assert.equal(out.directive.params.tighten, true);
  assert.deepEqual(out.directive.given, ['duration']);
  assert.deepEqual(out.directive.context, { playheadPosition: 0, range: null, selection: [] });
});

test('normalizeDirective clamps ranges and coerces toggles', () => {
  const out = normalizeDirective({
    action: 'remove_silence',
    params: { threshold: 99, padding: -1 },
    context: { playheadPosition: '12.5', selection: ['a', 7, ''], range: { start: 4, end: 2 } },
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.directive.params.threshold, 3);
  assert.equal(out.directive.params.padding, 0);
  assert.deepEqual(out.directive.context, {
    playheadPosition: 12.5,
    range: null,
    selection: ['a'],
  });
  const toggled = normalizeDirective({ action: 'beat_sync', params: { protectSpeech: 'false' } });
  assert.equal(toggled.ok && toggled.directive.params.protectSpeech, false);
});

test('normalizeDirective rejects unknown actions with 400', () => {
  assert.deepEqual(normalizeDirective(null), {
    ok: false,
    status: 400,
    error: 'directive required',
  });
  const out = normalizeDirective({ action: 'explode' });
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 400);
});

test('normalizeDirective reports bad fields with 422', () => {
  const out = normalizeDirective({
    action: 'insert_broll',
    mode: 'replace',
    prompt: 42,
    params: { duration: 'long', placement: 'sideways', useLlm: 'maybe' },
  });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.status, 422);
  assert.deepEqual(Object.keys(out.fields).sort(), [
    'mode',
    'params.duration',
    'params.placement',
    'params.useLlm',
    'prompt',
  ]);
});

test('mode "range" needs a valid context.range', () => {
  const bad = normalizeDirective({ action: 'generate_edit', mode: 'range' });
  assert.equal(!bad.ok && bad.fields['context.range'] !== undefined, true);
  const good = normalizeDirective({
    action: 'generate_edit',
    mode: 'range',
    prompt: '  the best bits ',
    context: { range: { start: 10, end: 20 } },
  });
  assert.equal(good.ok && good.directive.prompt, 'the best bits');
  assert.deepEqual(good.ok && good.directive.context.range, { start: 10, end: 20 });
});

test('custom select values are allowed only where the field says so', () => {
  const custom = normalizeDirective({
    action: 'generate_edit',
    params: { style: 'noir thriller' },
  });
  assert.equal(custom.ok && custom.directive.params.style, 'noir thriller');
  const strict = normalizeDirective({ action: 'base_edit', params: { style: 'noir thriller' } });
  assert.equal(strict.ok, false);
});

test('the legacy params.prompt is still read as the prompt', () => {
  const out = normalizeDirective({ action: 'generate_edit', params: { prompt: 'park day' } });
  assert.equal(out.ok && out.directive.prompt, 'park day');
});

test('the layout puts titles in front of b-roll in front of the main picture', () => {
  assert.ok(LAYOUT.titles.index < LAYOUT.broll.index && LAYOUT.broll.index < LAYOUT.main.index);
  assert.deepEqual(
    layoutOrder().map((k) => LAYOUT[k].type),
    ['video', 'video', 'video', 'audio', 'audio', 'audio'],
  );
  const audio = [LAYOUT.dialogue.index, LAYOUT.ambience.index, LAYOUT.music.index];
  assert.equal(new Set(audio).size, 3);
});

test('the plan schema compiles and accepts its own example', () => {
  const validate = new Ajv({ allErrors: true }).compile(PLAN_SCHEMA);
  assert.equal(validate(PLAN_EXAMPLE), true, JSON.stringify(validate.errors));
  assert.equal(validate({ picks: [] }), false);
  assert.equal(validate({ picks: [{ role: 'primary' }] }), false);
  assert.equal(validate({ picks: [{ file: 'm1', role: 'hero' }] }), false);
});
