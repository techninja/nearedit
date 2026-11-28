import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EASINGS,
  RECIPE_LIMITS,
  STEP_KINDS,
  defaultRecipe,
  normalizeRecipe,
  normalizeStep,
} from './index.js';

const URL_OK = 'https://example.com/pricing?plan=pro#top';

/** Freeze a value all the way down: a normaliser that mutates then throws. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('normalizeRecipe: defaults', () => {
  it('fills every field of the smallest recipe', () => {
    assert.deepEqual(normalizeRecipe({ url: 'https://example.com' }), {
      url: 'https://example.com',
      viewport: { width: 1280, height: 720 },
      scale: 2,
      colorScheme: 'light',
      lead: 0.6,
      tail: 1,
      cursor: { style: 'arrow', size: 1, color: '#111827', clicks: true },
      hide: [],
      storage: '',
      onMissing: 'fail',
      steps: [],
    });
  });

  it('gives the default recipe for nothing at all', () => {
    for (const raw of [undefined, null, 0, 'x', [], () => {}, new Date(), Symbol('s')]) {
      assert.deepEqual(normalizeRecipe(raw), defaultRecipe());
    }
  });

  it('fills the parameters of every step kind and leaves timing to the table', () => {
    for (const kind of STEP_KINDS) {
      const step = normalizeStep({ do: kind.do });
      const wanted = { do: kind.do, ease: 'ease-in-out', note: '' };
      for (const [name, spec] of Object.entries(kind.params)) wanted[name] = spec.default;
      assert.deepEqual(step, wanted, kind.do);
      assert.ok(!('duration' in step) && !('hold' in step), kind.do);
    }
  });

  it('keeps what a step sets', () => {
    const [step] = normalizeRecipe({
      url: URL_OK,
      steps: [
        {
          do: 'click',
          target: '  text=Get started ',
          index: 2,
          button: 'right',
          count: 2,
          duration: 0.25,
          hold: 0,
          ease: 'back-out',
          note: 'open the menu',
        },
      ],
    }).steps;
    assert.deepEqual(step, {
      do: 'click',
      target: 'text=Get started',
      index: 2,
      button: 'right',
      count: 2,
      duration: 0.25,
      hold: 0,
      ease: 'back-out',
      note: 'open the menu',
    });
  });

  it('keeps a point target as a point and a scroll position as a number', () => {
    const { steps } = normalizeRecipe({
      url: URL_OK,
      steps: [
        { do: 'move', target: { x: 640.5, y: 300, z: 9 } },
        { do: 'scroll', to: 1200 },
        { do: 'scroll', to: '800' },
        { do: 'scroll', to: 'bottom' },
        { do: 'scroll', to: '#pricing' },
        { do: 'press', key: 'a', modifiers: ['Shift', 'Hyper', 'Control', 'Shift'] },
      ],
    });
    assert.deepEqual(steps[0].target, { x: 640.5, y: 300 });
    assert.deepEqual(
      steps.slice(1, 5).map((step) => step.to),
      [1200, 800, 'bottom', '#pricing'],
    );
    assert.deepEqual(steps[5].modifiers, ['Control', 'Shift']);
  });
});

describe('normalizeRecipe: bounds', () => {
  it('clamps numbers to their ranges', () => {
    const low = normalizeRecipe({
      url: URL_OK,
      viewport: { width: 1, height: 1 },
      scale: 0,
      lead: -5,
      tail: -1,
      cursor: { size: 0 },
    });
    assert.deepEqual(low.viewport, { width: 320, height: 240 });
    assert.deepEqual([low.scale, low.lead, low.tail, low.cursor.size], [1, 0, 0, 0.25]);
    const high = normalizeRecipe({
      url: URL_OK,
      viewport: { width: 1e9, height: 1e9 },
      scale: 99,
      lead: 1e9,
      tail: Infinity,
      cursor: { size: 99 },
      steps: [
        { do: 'wait', duration: 1e9, hold: -3 },
        { do: 'type', text: 'a', speed: 1e6 },
      ],
    });
    assert.deepEqual(high.viewport, { width: 3840, height: 2160 });
    assert.deepEqual([high.scale, high.lead, high.tail, high.cursor.size], [3, 120, 1, 4]);
    assert.deepEqual([high.steps[0].duration, high.steps[0].hold], [120, 0]);
    assert.equal(high.steps[1].speed, 60);
  });

  it('rounds the viewport and whole-number parameters', () => {
    const recipe = normalizeRecipe({
      url: URL_OK,
      viewport: { width: '1000.6', height: 600.4 },
      steps: [{ do: 'click', target: 'a', count: 1.6, index: '2' }],
    });
    assert.deepEqual(recipe.viewport, { width: 1001, height: 600 });
    assert.deepEqual([recipe.steps[0].count, recipe.steps[0].index], [2, 2]);
  });

  it('falls back on unknown words, colours and easings', () => {
    const recipe = normalizeRecipe({
      url: URL_OK,
      colorScheme: 'sepia',
      onMissing: 'explode',
      cursor: { style: 'hand', color: 'red', clicks: 'false' },
      steps: [
        { do: 'click', target: 'a', button: 'thumb', ease: 'wobble' },
        { do: 'highlight', target: 'a', style: 'glow', color: 'blue' },
        { do: 'scroll', to: 'top', align: 'middle' },
      ],
    });
    assert.equal(recipe.colorScheme, 'light');
    assert.equal(recipe.onMissing, 'fail');
    assert.deepEqual(recipe.cursor, { style: 'arrow', size: 1, color: '#111827', clicks: false });
    assert.deepEqual([recipe.steps[0].button, recipe.steps[0].ease], ['left', 'ease-in-out']);
    assert.deepEqual([recipe.steps[1].style, recipe.steps[1].color], ['outline', '#f59e0b']);
    assert.equal(recipe.steps[2].align, 'center');
    assert.ok(EASINGS.includes(recipe.steps[0].ease));
  });

  it('bounds every string', () => {
    const long = 'x'.repeat(30000);
    const recipe = normalizeRecipe({
      url: `https://example.com/${long}`,
      storage: long,
      hide: [long],
      steps: [
        { do: 'type', text: long, target: long, note: long },
        { do: 'run', js: long },
        { do: 'goto', url: `/${long}` },
        { do: 'press', key: long },
      ],
    });
    assert.equal(recipe.url, '', 'an address over the limit is no address');
    assert.equal(recipe.storage.length, RECIPE_LIMITS.storage);
    assert.equal(recipe.hide[0].length, RECIPE_LIMITS.target);
    assert.equal(recipe.steps[0].text.length, RECIPE_LIMITS.text);
    assert.equal(recipe.steps[0].target.length, RECIPE_LIMITS.target);
    assert.equal(recipe.steps[0].note.length, RECIPE_LIMITS.note);
    assert.equal(recipe.steps[1].js.length, RECIPE_LIMITS.js);
    assert.equal(recipe.steps[2].url, '');
    assert.equal(recipe.steps[3].key.length, RECIPE_LIMITS.key);
    assert.equal(normalizeRecipe({ url: `https://e.com/${'x'.repeat(1980)}` }).url.length, 1994);
  });

  it('keeps at most 200 steps and 50 hidden targets, dropping what is not a step', () => {
    const steps = [];
    for (let i = 0; i < 260; i++) steps.push({ do: 'wait' }, { do: 'teleport' }, null, 'wait');
    const hide = Array.from({ length: 80 }, (_, i) => `#ad-${i}`);
    const recipe = normalizeRecipe({ url: URL_OK, steps, hide: ['', 5, ...hide] });
    assert.equal(recipe.steps.length, 200);
    assert.ok(recipe.steps.every((step) => step.do === 'wait'));
    assert.equal(recipe.hide.length, 50);
    assert.equal(recipe.hide[0], '#ad-0');
  });
});

describe('normalizeRecipe: the address', () => {
  it('accepts http and https, as written', () => {
    for (const url of ['http://localhost:5173', 'HTTPS://Example.com/a b', URL_OK]) {
      assert.equal(normalizeRecipe({ url: `  ${url} ` }).url, url);
    }
  });

  it('turns anything else into no address', () => {
    const bad = [
      'example.com',
      '/pricing',
      '//example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<p>hi',
      'ftp://example.com',
      'http://',
      'https:// example.com',
      'about:blank',
      42,
      { href: URL_OK },
    ];
    for (const url of bad) assert.equal(normalizeRecipe({ url }).url, '', String(url));
  });

  it('lets a goto step be relative, but not leave the web', () => {
    const urls = [
      '/pricing',
      'docs/start?tab=2',
      '#faq',
      'https://example.org/x',
      '//cdn.example.com',
    ];
    const steps = [...urls, 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x'].map(
      (url) => ({ do: 'goto', url }),
    );
    const read = normalizeRecipe({ url: URL_OK, steps }).steps.map((step) => step.url);
    assert.deepEqual(read, [...urls, '', '', '']);
  });
});
