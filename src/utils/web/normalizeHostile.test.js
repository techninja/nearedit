import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_KINDS, defaultRecipe, normalizeRecipe, normalizeStep } from './index.js';

const URL_OK = 'https://example.com/pricing?plan=pro#top';

/** Freeze a value all the way down: a normaliser that mutates then throws. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('normalizeRecipe: hostile input', () => {
  it('never reads through a prototype', () => {
    const polluted = JSON.parse(
      '{"__proto__":{"url":"https://evil.example"},"constructor":{"prototype":{"x":1}},"steps":[{"__proto__":{"do":"run","js":"1"}}]}',
    );
    assert.deepEqual(normalizeRecipe(polluted), defaultRecipe());
    const inherited = Object.create({ url: URL_OK, steps: [{ do: 'wait' }] });
    assert.deepEqual(normalizeRecipe(inherited), defaultRecipe());
    assert.equal(normalizeStep(Object.create({ do: 'wait' })), null);
    assert.equal(normalizeStep({ do: 'constructor' }), null);
    assert.equal(normalizeStep({ do: '__proto__' }), null);
    assert.equal({}.url, undefined, 'nothing was polluted');
  });

  it('survives cycles, class instances and wrong types everywhere', () => {
    const cycle = { url: URL_OK, steps: [] };
    cycle.self = cycle;
    cycle.steps.push({ do: 'click', target: cycle, note: cycle }, cycle);
    cycle.viewport = cycle;
    cycle.cursor = [cycle];
    cycle.hide = [cycle, [cycle]];
    const read = normalizeRecipe(cycle);
    assert.equal(read.steps.length, 1);
    assert.deepEqual(read.steps[0], normalizeStep({ do: 'click' }));
    assert.deepEqual(read.hide, []);
    assert.doesNotThrow(() => JSON.stringify(read));
    const wrong = normalizeRecipe({
      url: URL_OK,
      viewport: 'big',
      scale: {},
      lead: [],
      tail: NaN,
      cursor: 7,
      hide: 'all',
      storage: {},
      onMissing: 3,
      steps: { 0: { do: 'wait' }, length: 1 },
    });
    assert.deepEqual(wrong, { ...defaultRecipe(), url: URL_OK });
    class Recipe {
      url = URL_OK;
    }
    assert.deepEqual(normalizeRecipe(new Recipe()), defaultRecipe());
  });

  it('returns plain JSON-safe data that shares nothing with its input', () => {
    const raw = deepFreeze({
      url: URL_OK,
      viewport: { width: 800, height: 600 },
      hide: ['#ad', { x: 1, y: 2 }],
      steps: [
        { do: 'press', key: 'k', modifiers: ['Alt'] },
        { do: 'move', target: { x: 3, y: 4 } },
      ],
    });
    const read = normalizeRecipe(raw);
    assert.deepEqual(JSON.parse(JSON.stringify(read)), read);
    assert.notEqual(read.viewport, raw.viewport);
    assert.notEqual(read.hide[1], raw.hide[1]);
    assert.notEqual(read.steps[0].modifiers, raw.steps[0].modifiers);
    assert.notEqual(read.steps[1].target, raw.steps[1].target);
    read.steps[0].modifiers.push('Shift');
    assert.deepEqual(normalizeStep({ do: 'press' }).modifiers, [], 'the table is not shared');
  });
});

describe('normalizeRecipe: idempotence', () => {
  const samples = [
    {},
    { url: URL_OK },
    { url: 'nope', steps: [{ do: 'wait' }] },
    {
      url: URL_OK,
      viewport: { width: 99999, height: 3 },
      scale: 1.5,
      lead: '0.25',
      hide: [' #cookie ', { x: 5, y: 6 }, 'text='],
      steps: STEP_KINDS.flatMap((kind) => [
        { do: kind.do },
        { do: kind.do, target: ' label=Email ', duration: '2', hold: 0.123456789, note: ' n ' },
        { do: kind.do, to: 'top', by: 50, text: 'héllo 👋', key: ' ', js: ' 1 + 1 ', url: ' /a ' },
      ]),
    },
  ];
  for (const [i, raw] of samples.entries()) {
    it(`normalising twice changes nothing more (sample ${i})`, () => {
      const once = normalizeRecipe(deepFreeze(structuredClone(raw)));
      assert.deepEqual(normalizeRecipe(deepFreeze(once)), once);
      assert.deepEqual(normalizeRecipe(JSON.parse(JSON.stringify(once))), once);
    });
  }

  it('a full 200-step recipe survives a save and a load', () => {
    const steps = Array.from({ length: 200 }, (_, i) => ({
      do: 'type',
      text: `line ${i}`,
      target: 'label=Notes',
      duration: 1,
      hold: 0.5,
      note: `step ${i}`,
    }));
    const once = normalizeRecipe({ url: URL_OK, steps });
    assert.equal(once.steps.length, 200);
    assert.deepEqual(normalizeRecipe(JSON.parse(JSON.stringify(once))), once);
  });
});
