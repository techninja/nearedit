import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipe } from '#utils/web/index.js';
import { forgetSaid, rememberSaid, saidOf } from './saidMemory.js';
import { coverSelector, readStepSaid, saidByStep, stepsSaid, withHidden } from './stepSaid.js';

const COVERED = 'Step 3 (click): css=#veiled is covered by <div#veil.veil.chat> "Chat with us"';
const CUT =
  'Step 2 (hover): text=Row 40 cannot be brought into view: it is cut off by <div#closed>';
const OUTSIDE = 'Step 1 (click): #x cannot be brought into view: it lies outside the picture';
const MISSING = 'Step 5 (type): nothing has the label "Email"';

describe('what the recorder says about a step', () => {
  it('finds the step, what is in the way and what to do about it', () => {
    const said = readStepSaid(COVERED);
    assert.equal(said.index, 2);
    assert.equal(said.kind, 'covered');
    assert.equal(said.cover, 'div#veil.veil.chat');
    assert.match(said.advice, /Hide what is in the way/);
    assert.equal(said.text, COVERED);
  });

  it('tells a target that cannot be brought into view from one that was not found', () => {
    assert.deepEqual(
      [CUT, OUTSIDE, MISSING].map((text) => [readStepSaid(text).index, readStepSaid(text).kind]),
      [
        [1, 'cut'],
        [0, 'cut'],
        [4, 'other'],
      ],
    );
    assert.equal(readStepSaid(CUT).cover, '');
    assert.match(readStepSaid(CUT).advice, /scrolled into view/);
    assert.match(readStepSaid(MISSING).advice, /Pick the target again/);
  });

  it('reads a sentence wherever the step stands in it, and nothing else', () => {
    assert.equal(readStepSaid(`The recipe cannot be recorded — ${COVERED}`).index, 2);
    assert.equal(readStepSaid('The page did not load'), null);
    assert.equal(readStepSaid(''), null);
    assert.equal(readStepSaid(undefined), null);
  });

  it('turns the recorder’s description of an element into a selector the recipe accepts', () => {
    assert.equal(coverSelector('<div#chat.bubble> "Talk to us"'), 'div#chat.bubble');
    assert.equal(coverSelector('<button>'), 'button');
    assert.equal(
      coverSelector('<my-banner.cookie-bar.is-open> "We use cookies"'),
      'my-banner.cookie-bar.is-open',
    );
    assert.equal(coverSelector('the edge of the picture'), '');
    const hide = withHidden([], coverSelector('<div#veil.veil.chat>'));
    assert.deepEqual(normalizeRecipe({ url: 'https://example.com', hide }).hide, [
      'div#veil.veil.chat',
    ]);
  });

  it('collects what was said once each, and sorts the first of it under its step', () => {
    const said = stepsSaid([COVERED, undefined, 'unrelated', CUT, COVERED, MISSING]);
    assert.deepEqual(
      said.map((one) => one.index),
      [2, 1, 4],
    );
    assert.deepEqual(saidByStep(said), {
      1: { recorder: CUT },
      2: { recorder: COVERED },
      4: { recorder: MISSING },
    });
    assert.deepEqual(saidByStep([]), {});
  });

  it('adds a target to the hidden ones once', () => {
    const hide = ['#cookies'];
    assert.deepEqual(withHidden(hide, ' div#veil '), ['#cookies', 'div#veil']);
    assert.equal(withHidden(hide, '#cookies'), hide);
    assert.equal(withHidden(hide, ''), hide);
  });
});

describe('remembering what snapshots said', () => {
  const recipe = (steps, more = {}) =>
    normalizeRecipe({ url: 'https://example.com', steps, ...more });
  const STEPS = [
    { do: 'wait' },
    { do: 'hover', target: 'text=Row 40' },
    { do: 'click', target: '#veiled' },
  ];

  it('keeps a sentence for as long as the steps it was said of stay as they were', () => {
    forgetSaid();
    const first = recipe(STEPS);
    assert.deepEqual(saidOf(first), []);
    rememberSaid(first, COVERED);
    assert.deepEqual(saidOf(first), [COVERED]);
    // A later step, a note and the selection do not matter.
    const longer = recipe([...STEPS, { do: 'wait', note: 'after' }]);
    assert.deepEqual(saidOf(longer), [COVERED]);
    // The step itself, a step before it, or what the recipe hides do.
    const aimed = recipe([STEPS[0], STEPS[1], { do: 'click', target: '#other' }]);
    assert.deepEqual(saidOf(aimed), []);
    assert.deepEqual(saidOf(recipe([{ do: 'wait', duration: 2 }, ...STEPS.slice(1)])), []);
    assert.deepEqual(saidOf(recipe(STEPS, { hide: ['div#veil.veil.chat'] })), []);
    // Changed back, it is true again.
    assert.deepEqual(saidOf(recipe(STEPS)), [COVERED]);
  });

  it('lists what was said in step order, and forgets on demand', () => {
    forgetSaid();
    const all = recipe(STEPS);
    rememberSaid(all, COVERED);
    rememberSaid(all, CUT);
    rememberSaid(all, 'The page did not load');
    rememberSaid(all, 'Step 9 (click): #x was not found');
    assert.deepEqual(saidOf(all), [CUT, COVERED]);
    forgetSaid();
    assert.deepEqual(saidOf(all), []);
  });
});
