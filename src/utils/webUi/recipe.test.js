import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_KINDS, normalizeRecipe } from '#utils/web/index.js';
import * as edit from './recipeEdit.js';
import { NOT_A_VALUE, readField, recipeProblems, stepFields } from './stepForm.js';
import { blankStep, clockLabel, kindChoices, secondsLabel, stepRows } from './stepRows.js';
import { recordingSize, sizeChoices, sizeIdOf, sizePatch } from './sizes.js';

const recipe = (steps = [], more = {}) =>
  normalizeRecipe({ url: 'https://example.com', steps, ...more });
const kinds = (r) => normalizeRecipe(r).steps.map((step) => step.do);
const THREE = [{ do: 'wait' }, { do: 'click', target: 'text=Go' }, { do: 'press', key: 'Tab' }];

describe('recipe edits', () => {
  it('inserts, removes, copies and moves steps without touching the original', () => {
    const base = Object.freeze(recipe(THREE));
    assert.deepEqual(kinds(edit.insertStep(base, 1, { do: 'hover', target: '#a' })), [
      'wait',
      'hover',
      'click',
      'press',
    ]);
    assert.deepEqual(kinds(edit.insertStep(base, 99, { do: 'run', js: '1' })).at(-1), 'run');
    assert.deepEqual(kinds(edit.removeStep(base, 0)), ['click', 'press']);
    assert.deepEqual(kinds(edit.duplicateStep(base, 1)), ['wait', 'click', 'click', 'press']);
    assert.deepEqual(kinds(edit.moveStep(base, 2, 0)), ['press', 'wait', 'click']);
    assert.equal(edit.moveStep(base, 0, 0), base);
    assert.equal(edit.removeStep(base, 7), base);
    assert.equal(base.steps.length, 3);
  });

  it('refuses a step beyond the limit of 200', () => {
    const full = recipe(Array.from({ length: 200 }, () => ({ do: 'wait' })));
    assert.equal(edit.insertStep(full, 0, { do: 'wait' }), full);
  });

  it('sets named fields; undefined leaves a timing to its kind', () => {
    const base = recipe([{ do: 'click', target: 'text=Go', duration: 2 }]);
    const set = (name, value) => normalizeRecipe(edit.setRecipeField(base, name, value));
    assert.equal(set('steps.0.target', '#x').steps[0].target, '#x');
    assert.equal('duration' in set('steps.0.duration', undefined).steps[0], false);
    assert.equal(set('cursor.style', 'dot').cursor.style, 'dot');
    assert.equal(set('colorScheme', 'dark').colorScheme, 'dark');
    assert.deepEqual(set('size', 'wide').viewport, { width: 1920, height: 1080 });
    assert.equal(set('size', 'wide').scale, 1);
    assert.equal(edit.setRecipeField(base, 'steps', []), base);
  });

  it('keeps the selection on its step through removes and moves', () => {
    assert.equal(edit.selectionAfterRemove(2, 0), 1);
    assert.equal(edit.selectionAfterRemove(1, 1), 1);
    assert.equal(edit.selectionAfterMove(1, 1, 0), 0);
    assert.equal(edit.selectionAfterMove(1, 0, 2), 0);
    assert.equal(edit.selectionAfterMove(1, 2, 0), 2);
    assert.equal(edit.selectionAfterMove(3, 0, 1), 3);
  });
});

describe('step form', () => {
  it('has a field for every parameter of every kind, then the common four', () => {
    for (const kind of STEP_KINDS) {
      const [step] = recipe([{ do: kind.do }]).steps;
      const names = stepFields(step).map((field) => field.name);
      const expected = [...Object.keys(kind.params), 'duration', 'hold', 'ease', 'note'];
      assert.deepEqual(names, expected, kind.do);
    }
  });

  it('shows defaults as placeholders and only what differs as values', () => {
    const [step] = recipe([{ do: 'type', text: 'hello', target: 'label=Email', speed: 20 }]).steps;
    const field = Object.fromEntries(stepFields(step).map((each) => [each.name, each]));
    assert.equal(field.text.value, 'hello');
    assert.equal(field.speed.value, '20');
    assert.equal(field.index.value, '');
    assert.equal(field.index.placeholder, '0');
    assert.equal(field.clear.value, false);
    assert.equal(field.duration.value, '');
    assert.equal(field.duration.placeholder, '0.75'); // 0.5 s to get there + 5 / 20
    assert.equal(field.hold.placeholder, '0.5');
    assert.equal(field.ease.value, 'ease-in-out');
    assert.match(field.target.placeholder, /text=/);
    const [scroll] = recipe([{ do: 'scroll', to: 400, duration: 2 }]).steps;
    const to = stepFields(scroll).find((each) => each.name === 'to');
    assert.equal(to.value, '400');
    assert.match(to.placeholder, /top, bottom, pixels/);
    assert.equal(stepFields(scroll).find((each) => each.name === 'duration').value, '2');
    assert.deepEqual(stepFields({ do: 'nonsense' }), []);
  });

  it('reads what is typed into a box', () => {
    const [step] = recipe([{ do: 'scroll', to: 'top' }]).steps;
    const field = Object.fromEntries(stepFields(step).map((each) => [each.name, each]));
    assert.equal(readField(field.to, ' 300 '), 300);
    assert.equal(readField(field.to, 'text=Pricing'), 'text=Pricing');
    assert.equal(readField(field.by, '-120'), -120);
    assert.equal(readField(field.by, '1,5'), 1.5);
    assert.equal(readField(field.by, ''), 0);
    assert.equal(readField(field.by, 'far'), NOT_A_VALUE);
    assert.equal(readField(field.duration, ''), undefined);
    assert.equal(readField(field.duration, '1.25'), 1.25);
    assert.equal(readField(field.note, ' spaces stay '), ' spaces stay ');
  });

  it('sorts problems to the step and field they belong to', () => {
    const bad = { url: 'ftp://x', steps: [{ do: 'wait' }, { do: 'click' }, { do: 'type' }] };
    const { recipe: top, steps } = recipeProblems(bad);
    assert.match(top.url, /not a web address/);
    assert.deepEqual(Object.keys(steps), ['1', '2']);
    assert.match(steps[1].target, /click needs a target/);
    assert.match(steps[2].text, /type needs "text"/);
    assert.deepEqual(recipeProblems(recipe(THREE)), { recipe: {}, steps: {} });
  });
});

describe('step rows and sizes', () => {
  it('lists every step with its label, start and length', () => {
    const { rows, duration } = stepRows(recipe(THREE), 30, { 1: { target: 'no such thing' } });
    assert.deepEqual(
      rows.map((row) => [row.label, row.start, Math.round(row.length * 100) / 100]),
      [
        ['Wait', 0.6, 1],
        ['Click: text=Go', 1.6, 1.3],
        ['Press a key: Tab', 2.9, 0.57],
      ],
    );
    assert.equal(rows[1].problem, 'no such thing');
    assert.equal(rows[0].problem, '');
    assert.ok(Math.abs(duration - 4.4667) < 0.001);
    assert.equal(secondsLabel(1.26), '1.3 s');
    assert.equal(clockLabel(4.24), '0:04.2');
    assert.equal(clockLabel(75), '1:15.0');
  });

  it('offers every step kind and makes a blank step of one', () => {
    assert.deepEqual(
      kindChoices().map((kind) => kind.do),
      STEP_KINDS.map((kind) => kind.do),
    );
    assert.deepEqual(blankStep('wait'), { do: 'wait' });
    assert.equal(blankStep('dance'), null);
  });

  it('knows the offered sizes and the recording each makes', () => {
    assert.equal(sizeIdOf(recipe()), 'desktop');
    assert.deepEqual(sizePatch('phone'), { viewport: { width: 390, height: 844 }, scale: 2 });
    assert.equal(sizePatch('custom'), null);
    const odd = recipe([], { viewport: { width: 1001, height: 601 }, scale: 1 });
    assert.equal(sizeIdOf(odd), 'custom');
    assert.deepEqual(sizeChoices(odd).at(-1), ['custom', 'Custom 1001 × 601']);
    assert.equal(sizeChoices(recipe()).length, 4);
    assert.deepEqual(recordingSize(odd), { width: 1000, height: 600 });
    assert.deepEqual(recordingSize(recipe()), { width: 2560, height: 1440 });
  });
});
