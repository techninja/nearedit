import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { EFFECTS, EFFECT_PRESETS, GENERATORS, TEXT_ANIMATIONS } from '#utils/compose/index.js';
import { FONT_FAMILIES, TEXT_UNITS } from '#utils/compose/index.js';
import { coerceField } from '../directive.js';
import { MOTION_PIECE } from '../actionsMotion.js';
import { BRAND } from '../brand/theme.js';
import { contrast, luminance, mix } from './color.js';
import { MOTION_PLAN_EXAMPLE, MOTION_PLAN_SCHEMA, NAME_FIELDS } from './planSchema.js';
import { AUTO, THEMES, choose, getTheme, pickTheme, themeIds } from './themes.js';
import * as vocab from './vocab.js';

const presets = GENERATORS.find((g) => g.type === 'particles').presets;
const wipe = EFFECTS.find((e) => e.type === 'wipe');
const pattern = GENERATORS.find((g) => g.type === 'pattern');

test('vocabularies that mirror the catalog are read from it', () => {
  const usable = presets.filter((p) => p.params.sprite !== 'image').map((p) => p.id);
  assert.deepEqual(vocab.PARTICLES, ['none', ...usable]);
  assert.ok(usable.length >= 10 && !vocab.PARTICLES.includes('images'));
  assert.deepEqual(vocab.LOOKS, ['none', ...EFFECT_PRESETS.map((p) => p.name)]);
  assert.deepEqual(vocab.ANIMATIONS, TEXT_ANIMATIONS);
  assert.deepEqual(vocab.UNITS, TEXT_UNITS);
  assert.deepEqual(vocab.WIPE_SHAPES, wipe.params.shape.options);
  assert.deepEqual(
    vocab.FONTS,
    FONT_FAMILIES.map((f) => f.id),
  );
  for (const kind of pattern.params.pattern.options) assert.ok(vocab.BACKGROUNDS.includes(kind));
  // Every wipe shape is a transition; the straight one is called "wipe".
  assert.deepEqual(vocab.TRANSITIONS.slice(0, 2), ['cut', 'fade']);
  for (const name of vocab.TRANSITIONS.slice(2)) {
    assert.ok(wipe.params.shape.options.includes(vocab.wipeShape(name)), name);
  }
  assert.equal(vocab.wipeShape('wipe'), 'linear');
  assert.equal(vocab.wipeShape('fade'), null);
  assert.equal(vocab.wipeShape('cut'), null);
  assert.equal(vocab.particlePreset('snow').id, 'snow');
  assert.equal(vocab.particlePreset('images'), undefined);
  assert.equal(vocab.lookPreset('cinematic').effects.length > 0, true);
  assert.equal(vocab.lookPreset('none'), undefined);
});

test('the vocabulary names every scene field of the plan schema', () => {
  const names = vocab.vocabulary();
  assert.deepEqual(Object.keys(names).sort(), [...NAME_FIELDS].sort());
  for (const [field, list] of Object.entries(names)) {
    assert.ok(list.length >= 2, field);
    assert.equal(new Set(list).size, list.length, `${field}: duplicate names`);
    for (const name of list) assert.match(name, /^[a-z][a-z0-9-]*$/, `${field}: ${name}`);
  }
});

test('there are at least six themes, each complete and within the vocabularies', () => {
  assert.ok(THEMES.length >= 6);
  assert.equal(new Set(themeIds()).size, THEMES.length);
  const names = vocab.vocabulary();
  for (const theme of THEMES) {
    const at = (/** @type {string} */ what) => `${theme.id}: ${what}`;
    assert.ok(theme.label && theme.description, at('label'));
    for (const font of [theme.title, theme.subtitle]) {
      const family = FONT_FAMILIES.find((f) => f.id === font.fontFamily);
      assert.ok(family, at(`font ${font.fontFamily} is not bundled`));
      assert.ok(family.weights.includes(font.weight), at(`weight ${font.weight}`));
      if (font.italic) assert.ok((family.italicWeights || family.weights).includes(font.weight));
      assert.ok(font.size > 0.02 && font.size < 0.3, at('size'));
    }
    assert.ok(theme.backdrops.length >= 2, at('backdrops'));
    const lists = { backgrounds: 'background', particles: 'particles', accents: 'accent' };
    for (const [list, field] of Object.entries({ ...lists, transitions: 'transition' })) {
      assert.ok(theme[list].length >= 1, at(list));
      for (const name of theme[list]) assert.ok(names[field].includes(name), at(`${list} ${name}`));
    }
    for (const [animation, by] of theme.animations) {
      assert.ok(names.textAnimation.includes(animation) && names.by.includes(by), at(animation));
    }
    assert.ok(names.look.includes(theme.look), at(`look ${theme.look}`));
    if (theme.subtitle.animation) assert.ok(names.textAnimation.includes(theme.subtitle.animation));
  }
});

test('a theme never puts blur or glow on the full-frame background by default', () => {
  for (const theme of THEMES) {
    const preset = vocab.lookPreset(theme.look);
    if (!preset) continue;
    const glowOnly = preset.effects.every((fx) => fx.type === 'glow');
    const heavy = preset.effects.some((fx) => fx.type === 'blur' || fx.type === 'glow');
    assert.ok(glowOnly || !heavy, `${theme.id}: ${theme.look} would blur the whole frame`);
  }
});

test('every theme’s type is readable on every one of its backdrops', () => {
  for (const theme of THEMES) {
    for (const backdrop of theme.backdrops) {
      for (const colour of backdrop) {
        assert.match(colour, /^#[0-9a-f]{6}$/);
        const title = contrast(theme.ink, colour);
        const sub = contrast(theme.sub, colour);
        assert.ok(title >= 4.5, `${theme.id}: title ${theme.ink} on ${colour} = ${title}`);
        assert.ok(sub >= 4.5, `${theme.id}: subtitle ${theme.sub} on ${colour} = ${sub}`);
      }
    }
  }
});

test('colour arithmetic', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#102030', '#405060', 0), '#102030');
  assert.equal(mix('#102030', '#405060', 1), '#405060');
  assert.equal(luminance('#000000'), 0);
  assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9);
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.equal(contrast('#336699', '#336699'), 1);
  assert.equal(contrast('#ffffff', '#777777'), contrast('#777777', '#ffffff'));
});

test('auto picks a theme by the seed: whole numbers walk through all of them', () => {
  assert.equal(pickTheme('neon', 5).id, 'neon');
  assert.equal(pickTheme('NEON', 5).id, 'neon');
  assert.equal(getTheme('nope'), undefined);
  const walked = THEMES.map((_, i) => pickTheme(AUTO, i + 1).id);
  assert.deepEqual(walked, themeIds());
  assert.equal(pickTheme(AUTO, THEMES.length + 1).id, THEMES[0].id);
  assert.equal(pickTheme(undefined, 'spring sale').id, pickTheme(AUTO, 'spring sale').id);
  assert.ok(themeIds().includes(pickTheme('unknown', 'x').id));
});

test('choose is stable for a seed and a purpose, and walks the list with the step', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.equal(choose(list, 7, 1), choose(list, 7, 1));
  const walked = [0, 1, 2, 3].map((step) => choose(list, 7, 1, step));
  assert.deepEqual([...walked].sort(), list);
  const seen = new Set(Array.from({ length: 40 }, (_, seed) => choose(list, seed, 1)));
  assert.equal(seen.size, list.length);
});

test('the plan schema accepts its example and checks shape, not names', () => {
  const validate = new Ajv({ allErrors: true }).compile(MOTION_PLAN_SCHEMA);
  assert.ok(validate(MOTION_PLAN_EXAMPLE), JSON.stringify(validate.errors));
  assert.ok(validate({ scenes: [{ title: 'Only a title' }] }));
  assert.ok(validate({ scenes: [{ title: 'x', background: 'lava-lamp' }] }), 'unknown names pass');
  assert.equal(validate({ scenes: [] }), false);
  assert.equal(validate({ scenes: [{ subtitle: 'no title' }] }), false);
  assert.equal(validate({ scenes: [{ title: '' }] }), false);
  assert.equal(validate({ scenes: [{ title: 'x', duration: '4' }] }), false);
  assert.equal(validate({ scenes: [{ title: 'x', duration: 0 }] }), false);
  assert.equal(validate({ theme: 3, scenes: [{ title: 'x' }] }), false);
  const names = vocab.vocabulary();
  for (const scene of MOTION_PLAN_EXAMPLE.scenes) {
    for (const field of NAME_FIELDS) {
      if (scene[field]) assert.ok(names[field].includes(scene[field]), `${field} ${scene[field]}`);
    }
  }
  assert.ok(getTheme(MOTION_PLAN_EXAMPLE.theme));
});

test('the action schema offers the themes and the particle presets', () => {
  const field = (/** @type {string} */ key) => MOTION_PIECE.fields.find((f) => f.key === key);
  assert.equal(MOTION_PIECE.id, 'motion_piece');
  assert.equal(MOTION_PIECE.llm, 'optional');
  assert.equal(MOTION_PIECE.inPlace, false);
  assert.equal(MOTION_PIECE.prompt.required, false, 'checked by the route, like scripts');
  assert.deepEqual(MOTION_PIECE.modes, ['replace', 'append', 'prepend', 'insert', 'range']);
  assert.deepEqual(
    MOTION_PIECE.fields.map((f) => f.key),
    ['theme', 'duration', 'pacing', 'seed', 'particles', 'bumpers', 'useLlm'],
  );
  assert.deepEqual(
    field('theme').options.map((o) => o.value),
    [BRAND, AUTO, ...themeIds()],
  );
  assert.equal(field('theme').default, BRAND, 'on brand unless another theme is named');
  assert.deepEqual(
    field('particles').options.map((o) => o.value),
    [AUTO, ...vocab.PARTICLES],
  );
  assert.equal(field('useLlm').default, false);
  assert.equal(field('duration').default, 0);
  for (const f of MOTION_PIECE.fields) {
    assert.deepEqual(coerceField(f, f.default), { value: f.default }, f.key);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(MOTION_PIECE)), MOTION_PIECE);
});
