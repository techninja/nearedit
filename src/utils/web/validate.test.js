import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_KINDS, normalizeRecipe, validateRecipe } from './index.js';

const URL_OK = 'https://example.com';

/** Problems of a recipe with these steps, as `path: message` lines. */
const problems = (recipe) =>
  validateRecipe(recipe).problems.map(({ path, message }) => `${path}: ${message}`);
const ofSteps = (...steps) => problems({ url: URL_OK, steps });

describe('validateRecipe', () => {
  it('accepts the smallest recipe and a full one', () => {
    assert.deepEqual(validateRecipe({ url: URL_OK }), { valid: true, problems: [] });
    const full = {
      url: URL_OK,
      hide: ['#cookie-banner', 'text=Accept', { x: 5, y: 5 }],
      steps: [
        { do: 'wait' },
        { do: 'move', target: '#hero' },
        { do: 'hover', target: 'text=Pricing' },
        { do: 'click', target: { x: 640, y: 300 } },
        { do: 'type', text: 'hello' },
        { do: 'type', text: 'hello', target: 'label=Email' },
        { do: 'press', key: 'Enter' },
        { do: 'press' },
        { do: 'scroll', to: 'bottom' },
        { do: 'scroll', to: 1200 },
        { do: 'scroll', to: '#pricing' },
        { do: 'scroll', by: -300 },
        { do: 'select', target: 'label=Plan', value: '' },
        { do: 'highlight', target: 'css=.card' },
        { do: 'focus', target: 'point=10,20' },
        { do: 'goto', url: '/pricing' },
        { do: 'hide', target: '#chat' },
        { do: 'run', js: 'document.title = "x"' },
      ],
    };
    assert.deepEqual(problems(full), []);
    assert.deepEqual(problems(normalizeRecipe(full)), [], 'and so is its normalised form');
  });

  it('needs an address that starts with http:// or https://', () => {
    const required = 'url: is required: the address of the page, starting with http:// or https://';
    assert.deepEqual(problems({}), [required]);
    assert.deepEqual(problems({ url: '' }), [required]);
    assert.deepEqual(problems({ url: null }), [required]);
    assert.deepEqual(problems({ url: 'example.com' }), [
      'url: "example.com" is not a web address: it must start with http:// or https://',
    ]);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', '/pricing', 42]) {
      assert.match(problems({ url })[0], /^url: .* is not a web address/);
    }
    const long = problems({ url: `https://example.com/${'x'.repeat(3000)}` });
    assert.match(long[0], /^url: "https:\/\/example\.com\/x+… is longer than 2000 characters/);
    assert.ok(long[0].length < 200, 'the message does not echo the whole address');
  });

  it('says what is not a recipe at all', () => {
    for (const recipe of [null, undefined, 'https://example.com', [], 7]) {
      const result = validateRecipe(recipe);
      assert.equal(result.valid, false);
      assert.deepEqual(
        result.problems.map((problem) => problem.path),
        [''],
      );
      assert.match(result.problems[0].message, /a recipe is an object like/);
    }
  });

  it('reports a step that is not a step, with the kinds there are', () => {
    assert.deepEqual(problems({ url: URL_OK, steps: 'click' }), [
      'steps: must be a list of steps, like [{ "do": "click", "target": "text=Sign in" }]',
    ]);
    const [notObject, unknown, missing] = ofSteps('wait', { do: 'clik', target: 'a' }, {});
    assert.equal(
      notObject,
      'steps[0]: must be an object like { "do": "click", "target": "text=Sign in" }',
    );
    const names = STEP_KINDS.map((kind) => kind.do).join(', ');
    assert.equal(unknown, `steps[1].do: "clik" is not a step: use one of ${names}`);
    assert.equal(missing, `steps[2].do: is required: use one of ${names}`);
  });

  it('reports a step without the target it needs', () => {
    const aimed = STEP_KINDS.filter((kind) => kind.params.target?.required).map((kind) => kind.do);
    assert.deepEqual(aimed, ['move', 'hover', 'click', 'select', 'highlight', 'focus', 'hide']);
    for (const name of aimed) {
      const help = 'what to aim at, like "text=Sign in", "label=Email" or a CSS selector';
      assert.deepEqual(ofSteps({ do: name }), [`steps[0].target: ${name} needs a target: ${help}`]);
      assert.equal(ofSteps({ do: name, target: 5 }).length, 1, 'a number is no target');
      assert.equal(ofSteps({ do: name, target: '   ' }).length, 1);
    }
  });

  it('reports a target that cannot be read', () => {
    const forms =
      'after "text=", "label=" or "css=" something must follow, and a point is "point=640,300"';
    assert.deepEqual(ofSteps({ do: 'click', target: 'text=' }), [
      `steps[0].target: "text=" cannot be read as a target: ${forms}`,
    ]);
    assert.deepEqual(ofSteps({ do: 'type', text: 'x', target: 'point=left,top' }), [
      `steps[0].target: "point=left,top" cannot be read as a target: ${forms}`,
    ]);
    assert.deepEqual(ofSteps({ do: 'scroll', to: 'label=' }), [
      `steps[0].to: "label=" cannot be read as a target: ${forms}`,
    ]);
    assert.deepEqual(problems({ url: URL_OK, hide: ['#ok', 'css=', 9] }), [
      `hide[1]: "css=" cannot be read as a target: ${forms}`,
      `hide[2]: 9 cannot be read as a target: ${forms}`,
    ]);
    assert.deepEqual(problems({ url: URL_OK, hide: '#ad' }), ['hide: must be a list of targets']);
  });

  it('reports what else a step needs', () => {
    assert.deepEqual(ofSteps({ do: 'type' }), ['steps[0].text: type needs "text"']);
    assert.deepEqual(ofSteps({ do: 'type', text: '' }), ['steps[0].text: type needs "text"']);
    assert.deepEqual(ofSteps({ do: 'run' }), ['steps[0].js: run needs "js" (the script)']);
    assert.deepEqual(ofSteps({ do: 'goto' }), ['steps[0].url: goto needs "url" (the address)']);
    assert.deepEqual(ofSteps({ do: 'goto', url: 'javascript:alert(1)' }), [
      'steps[0].url: "javascript:alert(1)" is not somewhere a page can go: use http://, https:// or a path',
    ]);
    assert.deepEqual(ofSteps({ do: 'scroll' }), ['steps[0].to: scroll needs "to" or "by"']);
    assert.deepEqual(ofSteps({ do: 'scroll', by: 0 }), ['steps[0].to: scroll needs "to" or "by"']);
  });

  it('gives every problem the path of its step', () => {
    const paths = validateRecipe({
      steps: [{ do: 'wait' }, { do: 'click' }, { do: 'nope' }, { do: 'type', target: 'text=' }],
    }).problems.map((problem) => problem.path);
    assert.deepEqual(paths, [
      'url',
      'steps[1].target',
      'steps[2].do',
      'steps[3].text',
      'steps[3].target',
    ]);
  });

  it('reports more than 200 steps and more than ten minutes', () => {
    const many = Array.from({ length: 201 }, () => ({ do: 'wait', duration: 0.1 }));
    assert.deepEqual(problems({ url: URL_OK, steps: many }), [
      'steps: has 201 steps; a recording plays at most 200',
    ]);
    const slow = Array.from({ length: 7 }, () => ({ do: 'wait', duration: 100 }));
    assert.deepEqual(problems({ url: URL_OK, steps: slow }), [
      'steps: the recording would run 702 s; the longest is 600 s',
    ]);
    const justUnder = Array.from({ length: 5 }, () => ({ do: 'wait', duration: 119.68 }));
    assert.deepEqual(problems({ url: URL_OK, steps: justUnder }), []);
  });

  it('never throws and never changes what it is given', () => {
    const cycle = { url: URL_OK, steps: [] };
    cycle.steps.push(cycle, { do: 'click', target: cycle });
    assert.equal(validateRecipe(cycle).valid, false);
    const frozen = Object.freeze({
      url: URL_OK,
      steps: Object.freeze([Object.freeze({ do: 'x' })]),
    });
    assert.equal(validateRecipe(frozen).valid, false);
    assert.equal(validateRecipe(Object.create({ url: URL_OK })).valid, false);
  });
});
