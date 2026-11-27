import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, getAction } from '#utils/director/actions.js';
import { normalizeDirective } from '#utils/director/directive.js';
import { buildDirective, fieldGroups, fieldProblems, initialValues } from './form.js';
import { rangeText, usesLlm } from './form.js';

const context = { playheadPosition: 3, selection: [], range: { start: 2, end: 8 } };

describe('initialValues', () => {
  it('takes every field default from the schema', () => {
    const values = initialValues(getAction('base_edit'));
    assert.equal(values.duration, 60);
    assert.equal(values.style, 'auto');
    assert.equal(values.tighten, true);
    assert.equal(values.title, '');
    assert.equal(Object.keys(values).length, getAction('base_edit').fields.length);
  });
});

describe('fieldGroups', () => {
  it('shows short forms whole', () => {
    const groups = fieldGroups(getAction('remove_silence'));
    assert.equal(groups.main.length, 2);
    assert.equal(groups.more.length, 0);
  });

  it('tucks the tail of a long form under "more", in schema order', () => {
    const action = getAction('base_edit');
    const groups = fieldGroups(action);
    assert.deepEqual(
      groups.main.map((f) => f.key),
      ['duration', 'style', 'pacing'],
    );
    assert.equal(groups.main.length + groups.more.length, action.fields.length);
    assert.equal(groups.more[0].key, 'tighten');
  });
});

describe('buildDirective', () => {
  it('produces a directive the server accepts, for every action with its defaults', () => {
    for (const action of ACTIONS) {
      const mode = action.defaultMode;
      const directive = buildDirective({
        action,
        mode,
        prompt: 'hello',
        values: initialValues(action),
        context,
      });
      const checked = normalizeDirective(directive);
      assert.equal(checked.ok, true, `${action.id}: ${JSON.stringify(checked)}`);
      assert.equal(checked.directive.action, action.id);
    }
  });

  it('produces an accepted directive for every mode an action offers', () => {
    for (const action of ACTIONS) {
      for (const mode of action.modes) {
        const directive = buildDirective({
          action,
          mode,
          prompt: '',
          values: initialValues(action),
          context,
        });
        const checked = normalizeDirective(directive);
        assert.equal(checked.ok, true, `${action.id}/${mode}`);
        assert.equal(checked.directive.mode, mode);
      }
    }
  });

  it('sends edited values and leaves empty text fields to the server', () => {
    const action = getAction('base_edit');
    const values = { ...initialValues(action), duration: 25, music: false, title: '' };
    const directive = buildDirective({ action, mode: 'append', prompt: '', values, context });
    assert.equal(directive.params.duration, 25);
    assert.equal(directive.params.music, false);
    assert.equal('title' in directive.params, false);
    assert.equal(directive.mode, 'append');
    assert.equal('prompt' in directive, false, 'base_edit takes no prompt');
  });

  it('includes a trimmed prompt only for actions that take one', () => {
    const action = getAction('generate_edit');
    const directive = buildDirective({
      action,
      mode: 'replace',
      prompt: '  a short reel  ',
      values: {},
      context,
    });
    assert.equal(directive.prompt, 'a short reel');
    const empty = buildDirective({ action, mode: 'replace', prompt: '   ', values: {}, context });
    assert.equal('prompt' in empty, false);
  });

  it('has no mode for script writing', () => {
    const action = getAction('generate_script');
    const directive = buildDirective({
      action,
      mode: '',
      prompt: 'x',
      values: initialValues(action),
      context,
    });
    assert.equal('mode' in directive, false);
  });
});

describe('usesLlm', () => {
  it('is true for LLM actions and for optional ones switched on', () => {
    assert.equal(usesLlm(getAction('generate_edit'), {}), true);
    assert.equal(usesLlm(getAction('base_edit'), {}), false);
    assert.equal(usesLlm(getAction('insert_broll'), { useLlm: false }), false);
    assert.equal(usesLlm(getAction('insert_broll'), { useLlm: true }), true);
  });
});

describe('fieldProblems / rangeText', () => {
  it('maps server field names onto form keys', () => {
    assert.deepEqual(
      fieldProblems({ 'params.duration': 'Target length must be a number', mode: 'bad mode' }),
      { duration: 'Target length must be a number', mode: 'bad mode' },
    );
    assert.deepEqual(fieldProblems(undefined), {});
  });

  it('shows a range value with the precision of its step and its unit', () => {
    const fields = Object.fromEntries(getAction('base_edit').fields.map((f) => [f.key, f]));
    assert.equal(rangeText(fields.duration, 60), '60 s');
    assert.equal(rangeText(fields.threshold, 0.8), '0.80 s');
    assert.equal(rangeText(fields.padding, 0.1), '0.10 s');
    const count = getAction('insert_broll').fields.find((f) => f.key === 'count');
    assert.equal(rangeText(count, 3), '3');
  });
});
