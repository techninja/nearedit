import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  KEY_PATTERN,
  RECORDER_VERSION,
  STEP_KINDS,
  canonicalJson,
  canonicalRecipe,
  normalizeRecipe,
  recipeKey,
  sha256,
} from './index.js';

const reference = (data) => createHash('sha256').update(data).digest('hex');

const RECIPE = {
  url: 'https://example.com/pricing',
  viewport: { width: 1280, height: 720 },
  steps: [
    { do: 'click', target: 'text=Get started', note: 'open' },
    { do: 'type', text: 'ada@example.com', target: 'label=Email' },
    { do: 'press', key: 'Enter', modifiers: ['Shift'] },
    { do: 'scroll', to: 'bottom' },
    { do: 'focus', target: '#pricing', zoom: 2 },
  ],
};

describe('sha256', () => {
  it('gives the published digests of the standard vectors', () => {
    assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(
      sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('equals node:crypto for text of every kind, non-ASCII included', () => {
    const texts = [
      'The quick brown fox jumps over the lazy dog',
      'héllo wörld — ça va?',
      '日本語のテキスト',
      '👋🏽 emoji with a modifier, and a flag 🇸🇪',
      'mixed \u0000 control \u001f chars \n\t\r',
      'a lone surrogate \ud83d in the middle',
      '﻿byte order mark',
      JSON.stringify(RECIPE),
    ];
    for (const text of texts) assert.equal(sha256(text), reference(text), text.slice(0, 30));
  });

  it('equals node:crypto at every length around the block boundaries', () => {
    for (let length = 0; length <= 200; length++) {
      const text = 'a'.repeat(length);
      assert.equal(sha256(text), reference(text), `length ${length}`);
    }
    for (const length of [511, 512, 513, 4095, 4096, 65537, 1_000_003]) {
      const text = 'é'.repeat(length);
      assert.equal(sha256(text), reference(text), `length ${length}`);
    }
  });

  it('equals node:crypto for random bytes', () => {
    for (const length of [1, 31, 55, 56, 63, 64, 65, 119, 120, 1000, 70000]) {
      const bytes = randomBytes(length);
      assert.equal(sha256(new Uint8Array(bytes)), reference(bytes), `length ${length}`);
    }
  });
});

describe('canonicalJson', () => {
  it('sorts the keys of every object and keeps lists in order', () => {
    const a = { b: 1, a: [{ d: 1, c: 2 }, 'x'], e: { g: null, f: true } };
    const b = { e: { f: true, g: null }, a: [{ c: 2, d: 1 }, 'x'], b: 1 };
    assert.equal(canonicalJson(a), '{"a":[{"c":2,"d":1},"x"],"b":1,"e":{"f":true,"g":null}}');
    assert.equal(canonicalJson(a), canonicalJson(b));
    assert.equal(canonicalJson({ a: undefined, b: 'q"uote' }), '{"b":"q\\"uote"}');
    assert.deepEqual(JSON.parse(canonicalJson(a)), a);
  });
});

describe('recipeKey', () => {
  const key = recipeKey(RECIPE, 30);

  it('is 20 lowercase hex digits: the start of the SHA-256 of version, fps and recipe', () => {
    assert.match(key, /^[0-9a-f]{20}$/);
    assert.match(key, KEY_PATTERN);
    const text = `${RECORDER_VERSION}\n30\n${canonicalJson(canonicalRecipe(RECIPE))}`;
    assert.equal(key, reference(text).slice(0, 20));
    assert.equal(RECORDER_VERSION, 1);
  });

  it('is the same for the same recipe, however it is written', () => {
    assert.equal(recipeKey(RECIPE, 30), key);
    assert.equal(recipeKey(structuredClone(RECIPE), 30), key);
    assert.equal(recipeKey(normalizeRecipe(RECIPE), 30), key, 'defaults written out');
    assert.equal(recipeKey(JSON.parse(JSON.stringify(normalizeRecipe(RECIPE))), 30), key);
    const reordered = {
      steps: RECIPE.steps.map((step) => Object.fromEntries(Object.entries(step).reverse())),
      viewport: { height: 720, width: 1280 },
      url: RECIPE.url,
      unknown: 'ignored',
    };
    assert.equal(recipeKey(reordered, 30), key);
  });

  it('ignores notes', () => {
    const noted = {
      ...RECIPE,
      steps: RECIPE.steps.map((step, i) => ({ ...step, note: `a caption for step ${i}` })),
    };
    assert.equal(recipeKey(noted, 30), key);
    assert.ok(!canonicalJson(canonicalRecipe(noted)).includes('caption'));
  });

  it('is the same whether a step spells out its default timing or not', () => {
    const spelled = {
      ...RECIPE,
      steps: [
        { ...RECIPE.steps[0], duration: 0.7, hold: 0.6 },
        { ...RECIPE.steps[1], duration: 0.5 + 15 / 14, hold: 0.5 },
        ...RECIPE.steps.slice(2),
      ],
    };
    assert.equal(recipeKey(spelled, 30), key);
  });

  it('changes with the frame rate and with the recorder version', () => {
    const keys = [24, 25, 30, 60].map((fps) => recipeKey(RECIPE, fps));
    assert.equal(new Set(keys).size, 4);
    assert.equal(recipeKey(RECIPE), key, '30 fps by default');
    assert.equal(recipeKey(RECIPE, 30, RECORDER_VERSION), key);
    assert.notEqual(recipeKey(RECIPE, 30, RECORDER_VERSION + 1), key);
  });

  it('changes with every field of the recipe', () => {
    const changes = {
      url: 'https://example.com/other',
      viewport: { width: 1281, height: 720 },
      scale: 1,
      colorScheme: 'dark',
      lead: 0.7,
      tail: 2,
      cursor: { style: 'dot' },
      hide: ['#cookie-banner'],
      storage: 'login.json',
      onMissing: 'skip',
      steps: RECIPE.steps.slice(0, 4),
    };
    const seen = new Set([key]);
    for (const [field, value] of Object.entries(changes)) {
      const changed = recipeKey({ ...RECIPE, [field]: value }, 30);
      assert.ok(!seen.has(changed), `${field} does not change the key`);
      seen.add(changed);
    }
    for (const part of [{ size: 2 }, { color: '#ff0000' }, { clicks: false }]) {
      const changed = recipeKey({ ...RECIPE, cursor: part }, 30);
      assert.ok(!seen.has(changed), `cursor ${JSON.stringify(part)}`);
      seen.add(changed);
    }
  });

  it('changes with every parameter of every step kind, and with its timing and easing', () => {
    const other = {
      target: 'label=Other',
      text: 'other',
      number: 3,
      boolean: true,
      key: 'Tab',
      code: '2',
    };
    for (const kind of STEP_KINDS) {
      const base = { do: kind.do, target: 'text=Go', text: 'hello', js: '1', url: '/a', to: 'top' };
      const recipe = (step) => ({ url: RECIPE.url, steps: [step] });
      const seen = new Set([recipeKey(recipe(base), 30)]);
      const variants = { duration: 3.21, hold: 4.32, ease: 'linear' };
      for (const [name, spec] of Object.entries(kind.params)) {
        variants[name] = spec.options
          ? spec.multiple
            ? [spec.options[0]]
            : spec.options.find((option) => option !== spec.default && option !== base[name])
          : spec.format === 'color'
            ? '#00ff00'
            : spec.format === 'url'
              ? '/b'
              : other[spec.type];
      }
      for (const [name, value] of Object.entries(variants)) {
        const changed = recipeKey(recipe({ ...base, [name]: value }), 30);
        assert.ok(!seen.has(changed), `${kind.do}.${name} does not change the key`);
        seen.add(changed);
      }
      assert.ok(seen.has(recipeKey(recipe({ ...base, note: 'x' }), 30)), `${kind.do} note`);
    }
  });

  it('differs when steps swap places', () => {
    const [a, b, ...rest] = RECIPE.steps;
    assert.notEqual(recipeKey({ ...RECIPE, steps: [b, a, ...rest] }, 30), key);
  });
});
