import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAction } from '#utils/director/actions.js';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { destructiveQuestion, modeChoices, pickMode } from './modes.js';

const situation = (extra = {}) => ({ range: null, insertAt: 12.5, selected: 0, fps: 30, ...extra });
const range = { start: 10, end: 20, source: 'loop' };

function docWithClips() {
  const doc = createEdl();
  doc.tracks[0].clips.push(
    createClip({ clipId: 'a', sourceFile: '/m/a.mp4', sourceOut: 30, timelineEnd: 30 }),
  );
  return doc;
}

describe('modeChoices', () => {
  it('offers every placement for a generating action, range only with a range', () => {
    const choices = modeChoices(getAction('base_edit'), situation());
    assert.deepEqual(
      choices.map((c) => c.id),
      ['replace', 'append', 'prepend', 'insert', 'range'],
    );
    assert.equal(choices.find((c) => c.id === 'range').available, false);
    assert.match(choices.find((c) => c.id === 'range').hint, /loop region/);
    assert.equal(
      choices.every((c) => c.id === 'range' || c.available),
      true,
    );
  });

  it('shows where an insert goes and what the range is', () => {
    const choices = modeChoices(getAction('generate_edit'), situation({ range }));
    assert.match(choices.find((c) => c.id === 'insert').hint, /00:00:12:15/);
    const rangeChoice = choices.find((c) => c.id === 'range');
    assert.equal(rangeChoice.available, true);
    assert.match(rangeChoice.hint, /00:00:10:00 – 00:00:20:00 \(the loop region\)/);
  });

  it('names the selection as the source of a range', () => {
    const fromSelection = { start: 1, end: 2, source: 'selection' };
    const choices = modeChoices(getAction('base_edit'), situation({ range: fromSelection }));
    assert.match(choices.find((c) => c.id === 'range').hint, /the selected clips/);
  });

  it('words in-place scopes by what is selected', () => {
    const none = modeChoices(getAction('remove_silence'), situation());
    assert.deepEqual(
      none.map((c) => c.id),
      ['replace', 'range'],
    );
    assert.equal(none[0].label, 'The whole timeline');
    const some = modeChoices(getAction('remove_silence'), situation({ selected: 2 }));
    assert.equal(some[0].label, 'The 2 selected clips');
    assert.equal(
      modeChoices(getAction('beat_sync'), situation({ selected: 1 }))[0].label,
      'The 1 selected clip',
    );
  });

  it('has no choices for script writing', () => {
    assert.deepEqual(modeChoices(getAction('generate_script'), situation()), []);
  });
});

describe('pickMode', () => {
  const action = getAction('base_edit');

  it('keeps a wanted mode that is available', () => {
    assert.equal(pickMode(action, modeChoices(action, situation()), 'append'), 'append');
  });

  it('falls back to the default when the wanted mode is not available', () => {
    assert.equal(pickMode(action, modeChoices(action, situation()), 'range'), 'replace');
    assert.equal(pickMode(action, modeChoices(action, situation()), ''), 'replace');
  });

  it('uses the action default for insert_broll and nothing for scripts', () => {
    const broll = getAction('insert_broll');
    assert.equal(pickMode(broll, modeChoices(broll, situation()), 'replace'), 'insert');
    const script = getAction('generate_script');
    assert.equal(pickMode(script, modeChoices(script, situation())), '');
  });
});

describe('destructiveQuestion', () => {
  const generate = getAction('base_edit');

  it('asks before replacing a timeline that has clips', () => {
    const question = destructiveQuestion(generate, 'replace', docWithClips(), null);
    assert.equal(question.title, 'Replace the whole timeline?');
    assert.match(question.message, /one undo step/);
  });

  it('does not ask on an empty timeline or for additive modes', () => {
    assert.equal(destructiveQuestion(generate, 'replace', createEdl(), null), null);
    for (const mode of ['append', 'prepend', 'insert']) {
      assert.equal(destructiveQuestion(generate, mode, docWithClips(), range), null, mode);
    }
  });

  it('asks before replacing a range that holds clips, and says how many', () => {
    const question = destructiveQuestion(generate, 'range', docWithClips(), range);
    assert.match(question.message, /^1 clip inside the range is cut out/);
    assert.equal(
      destructiveQuestion(generate, 'range', docWithClips(), { start: 40, end: 50 }),
      null,
    );
  });

  it('never asks for in-place actions, whose "replace" is a scope', () => {
    assert.equal(
      destructiveQuestion(getAction('remove_silence'), 'replace', docWithClips(), null),
      null,
    );
    assert.equal(
      destructiveQuestion(getAction('add_captions'), 'range', docWithClips(), range),
      null,
    );
  });
});
