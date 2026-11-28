import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURSOR_STYLES,
  EASINGS,
  RECIPE_LIMITS,
  STEP_COMMON,
  STEP_KINDS,
  clipScore,
  compileScore,
  isStale,
  isWebClip,
  normalizeRecipe,
  normalizeStep,
  recipeKey,
  stepKind,
  stepLabel,
  stepMarks,
  webDuration,
} from './index.js';

const recipe = normalizeRecipe({
  url: 'https://example.com',
  steps: [
    { do: 'click', target: 'text=Go' },
    { do: 'wait', note: 'let it load' },
  ],
});
const clip = (web) => ({ clipId: 'c', sourceIn: 0, web });

describe('isWebClip', () => {
  it('is true for a clip whose recipe names a page', () => {
    assert.equal(isWebClip(clip({ recipe, key: '', title: '' })), true);
    assert.equal(isWebClip({ web: { recipe: { url: 'https://example.com' } } }), true);
  });

  it('is false for everything else', () => {
    const blank = { ...recipe, url: '' };
    for (const other of [null, undefined, {}, clip(undefined), clip({}), clip({ recipe: blank })]) {
      assert.equal(isWebClip(other), false);
    }
    assert.equal(isWebClip({ web: { recipe: { url: 5 } } }), false);
    assert.equal(isWebClip({ sourceFile: '/a.mp4', generator: { type: '' } }), false);
  });
});

describe('clipScore and webDuration', () => {
  it('give the score of the recipe at a frame rate', () => {
    const web = clip({ recipe, key: '', title: '' });
    assert.deepEqual(clipScore(web, 25), compileScore(recipe, 25));
    assert.equal(webDuration(web, 30), 3.9);
    assert.equal(webDuration(web, 24), compileScore(recipe, 24).duration);
    assert.equal(webDuration(web), 3.9, '30 fps by default');
    assert.equal(webDuration(web, NaN), 3.9);
  });

  it('remember it per recipe object, frozen', () => {
    const web = clip({ recipe, key: '', title: '' });
    const score = clipScore(web, 30);
    assert.equal(
      clipScore({ ...web, clipId: 'other' }, 30),
      score,
      'same recipe, same score object',
    );
    assert.notEqual(clipScore(web, 60), score);
    assert.ok(
      Object.isFrozen(score) && Object.isFrozen(score.steps) && Object.isFrozen(score.steps[0]),
    );
    assert.notEqual(clipScore(clip({ recipe: { ...recipe }, key: '', title: '' }), 30), score);
  });

  it('are nothing for a clip that is not a web clip', () => {
    assert.equal(clipScore({}, 30), null);
    assert.equal(webDuration({ sourceFile: '/a.mp4' }, 30), undefined);
    assert.equal(webDuration(null, 30), undefined);
  });
});

describe('isStale', () => {
  const key = recipeKey(recipe, 30);

  it('is false while the key is the key of the recipe at that frame rate', () => {
    assert.equal(isStale(clip({ recipe, key, title: '' }), 30), false);
    assert.equal(isStale(clip({ recipe, key, title: 'any title' }), 30), false);
  });

  it('is true for a clip that was never recorded, or whose recipe or frame rate changed', () => {
    assert.equal(isStale(clip({ recipe, key: '', title: '' }), 30), true);
    assert.equal(isStale(clip({ recipe, key, title: '' }), 25), true);
    const changed = normalizeRecipe({ ...recipe, scale: 1 });
    assert.equal(isStale(clip({ recipe: changed, key, title: '' }), 30), true);
    const noted = normalizeRecipe({
      ...recipe,
      steps: recipe.steps.map((step) => ({ ...step, note: 'x' })),
    });
    assert.equal(isStale(clip({ recipe: noted, key, title: '' }), 30), false, 'notes do not count');
  });

  it('is false for a clip that is not a web clip', () => {
    assert.equal(isStale({ sourceFile: '/a.mp4' }, 30), false);
    assert.equal(isStale(clip({ recipe: { ...recipe, url: '' }, key: '', title: '' }), 30), false);
  });
});

describe('stepMarks and stepLabel', () => {
  it('marks every step at its start, with its note or what it does', () => {
    assert.deepEqual(stepMarks(clip({ recipe, key: '', title: '' }), 30), [
      { time: 0.6, label: 'Click: text=Go', do: 'click', index: 0 },
      { time: 1.9, label: 'let it load', do: 'wait', index: 1 },
    ]);
    assert.deepEqual(stepMarks(clip({ recipe, key: '', title: '' }), 24)[1].time, 45 / 24);
    assert.deepEqual(stepMarks({}, 30), []);
  });

  it('labels every kind of step', () => {
    const label = (step) => stepLabel(normalizeStep(step));
    assert.equal(label({ do: 'wait' }), 'Wait');
    assert.equal(label({ do: 'move', target: '#hero' }), 'Move: #hero');
    assert.equal(label({ do: 'hover', target: { x: 10, y: 20 } }), 'Hover: point=10,20');
    assert.equal(label({ do: 'type', text: 'hello', target: 'label=Email' }), 'Type: “hello”');
    assert.equal(
      label({ do: 'press', key: 'k', modifiers: ['Meta', 'Shift'] }),
      'Press a key: Meta+Shift+k',
    );
    assert.equal(label({ do: 'press' }), 'Press a key: Enter');
    assert.equal(label({ do: 'scroll', to: 'bottom' }), 'Scroll: bottom');
    assert.equal(label({ do: 'scroll', to: 1200 }), 'Scroll: 1200 px');
    assert.equal(label({ do: 'scroll', by: -300 }), 'Scroll: by (pixels) -300');
    assert.equal(label({ do: 'select', target: 'label=Plan', value: 'pro' }), 'Select: label=Plan');
    assert.equal(label({ do: 'highlight', target: '.card' }), 'Highlight: .card');
    assert.equal(label({ do: 'focus', target: '#plans', zoom: 2 }), 'Focus: #plans');
    assert.equal(label({ do: 'goto', url: '/pricing' }), 'Go to: “/pricing”');
    assert.equal(label({ do: 'hide', target: '#chat' }), 'Hide: #chat');
    assert.equal(label({ do: 'run', js: 'window.scrollTo(0, 0)' }), 'Run a script');
    assert.equal(label({ do: 'click', target: 'a', note: '  Open the menu  ' }), 'Open the menu');
    assert.equal(label({ do: 'click' }), 'Click');
    assert.equal(stepLabel(null), '');
    const long = label({ do: 'type', text: 'word '.repeat(40) });
    assert.ok(long.length <= 56 && long.endsWith('…'), long);
  });
});

describe('STEP_KINDS', () => {
  it('lists the thirteen kinds of the contract with their default timing', () => {
    const timing = Object.fromEntries(
      STEP_KINDS.map((kind) => [kind.do, [kind.duration, kind.hold]]),
    );
    assert.deepEqual(timing, {
      wait: [1, 0],
      move: [0.7, 0.2],
      hover: [0.7, 1],
      click: [0.7, 0.6],
      type: [0.5, 0.5],
      press: [0.15, 0.4],
      scroll: [1, 0.4],
      select: [0.7, 0.6],
      highlight: [0.4, 1.5],
      focus: [0.6, 1.5],
      goto: [0, 1],
      hide: [0, 0],
      run: [0, 0.2],
    });
  });

  it('describes every parameter completely', () => {
    const types = ['target', 'text', 'number', 'boolean', 'select', 'key', 'code'];
    for (const kind of STEP_KINDS) {
      assert.ok(kind.label && kind.description, kind.do);
      assert.equal(stepKind(kind.do), kind);
      for (const [name, spec] of Object.entries(kind.params)) {
        const where = `${kind.do}.${name}`;
        assert.ok(types.includes(spec.type), where);
        assert.ok(typeof spec.label === 'string' && spec.label, where);
        assert.ok('default' in spec, where);
        if (spec.type === 'number') {
          assert.ok(spec.min <= spec.default && spec.default <= spec.max, where);
        }
        if (spec.type === 'select') {
          assert.ok(spec.options.length > 1, where);
          const chosen = spec.multiple ? spec.default : [spec.default];
          assert.ok(
            chosen.every((option) => spec.options.includes(option)),
            where,
          );
        }
        assert.ok(!['do', 'duration', 'hold', 'ease', 'note'].includes(name), where);
      }
    }
  });

  it('carries the defaults of the contract', () => {
    const defaults = (name) =>
      Object.fromEntries(
        Object.entries(stepKind(name).params).map(([k, spec]) => [k, spec.default]),
      );
    assert.deepEqual(defaults('click'), { target: '', index: 0, button: 'left', count: 1 });
    assert.deepEqual(defaults('type'), { text: '', target: '', index: 0, speed: 14, clear: false });
    assert.deepEqual(defaults('press'), { key: 'Enter', modifiers: [] });
    assert.deepEqual(defaults('scroll'), { to: '', index: 0, by: 0, align: 'center' });
    assert.deepEqual(defaults('highlight').style, 'outline');
    assert.deepEqual(defaults('focus').zoom, 0);
    assert.deepEqual(stepKind('scroll').oneOf, ['to', 'by']);
    assert.deepEqual(
      STEP_KINDS.filter((kind) => kind.camera).map((kind) => [kind.do, kind.camera]),
      [
        ['click', 'clicks'],
        ['type', 'clicks'],
        ['focus', 'always'],
      ],
    );
  });

  it('cannot be changed, and knows nothing it was not told', () => {
    assert.ok(Object.isFrozen(STEP_KINDS) && Object.isFrozen(STEP_KINDS[3]));
    assert.ok(
      Object.isFrozen(STEP_KINDS[3].params) && Object.isFrozen(STEP_KINDS[3].params.target),
    );
    for (const name of ['constructor', '__proto__', 'toString', '', null, undefined, 3, 'Click']) {
      assert.equal(stepKind(name), undefined);
    }
  });

  it('comes with the common fields, the limits and the styles', () => {
    assert.deepEqual(Object.keys(STEP_COMMON), ['duration', 'hold', 'ease', 'note']);
    assert.equal(STEP_COMMON.ease.options, EASINGS);
    assert.equal(STEP_COMMON.ease.default, 'ease-in-out');
    assert.deepEqual(CURSOR_STYLES, ['arrow', 'dot', 'none']);
    assert.deepEqual(
      [
        RECIPE_LIMITS.steps,
        RECIPE_LIMITS.url,
        RECIPE_LIMITS.text,
        RECIPE_LIMITS.js,
        RECIPE_LIMITS.target,
      ],
      [200, 2000, 2000, 5000, 500],
    );
  });
});
