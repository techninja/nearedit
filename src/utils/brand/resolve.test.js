import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAND_VERSION,
  KEY_PATTERN,
  KitError,
  TOKEN_SCHEMA,
  builtinKit,
  kitChain,
  kitKey,
  normalizeKit,
  resolveKit,
} from './index.js';

const kit = (id, rest = {}) => normalizeKit({ id, ...rest });
const text = (id) => ({ type: 'text', id, text: id });

describe('resolveKit: inheritance', () => {
  it('rests every chain on a built-in kit, so the effective kit is complete', () => {
    const lone = resolveKit(kit('lone', { tokens: { color: { primary: '#ff0066' } } }));
    assert.deepEqual(lone.chain, ['lone', 'clean']);
    assert.equal(lone.extends, '');
    for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
      for (const name of Object.keys(specs)) {
        assert.notEqual(lone.tokens[group][name], undefined, `${group}.${name} is set`);
      }
    }
    assert.equal(lone.tokens.color.primary, '#ff0066');
    assert.deepEqual(lone.elements, builtinKit('clean').elements);
    assert.deepEqual(resolveKit(kit('b', { extends: 'builtin:bold' })).chain, ['b', 'bold']);
    assert.deepEqual(resolveKit(builtinKit('bold')).chain, ['bold']);
    assert.deepEqual(resolveKit([]).chain, ['clean']);
    assert.throws(() => resolveKit(kit('x', { extends: 'builtin:nope' })), KitError);
  });

  it('merges tokens key by key, the child winning, fonts field by field', () => {
    const parent = kit('parent', {
      tokens: {
        color: { primary: '#111111', accent: '#222222' },
        font: { heading: { family: 'Caveat', weight: 700, upper: true } },
        space: { margin: 9 },
      },
    });
    const child = kit('child', {
      extends: 'parent',
      tokens: { color: { primary: '#333333' }, font: { heading: { weight: 400 } } },
    });
    const { tokens } = resolveKit([child, parent]);
    assert.equal(tokens.color.primary, '#333333');
    assert.equal(tokens.color.accent, '#222222');
    assert.equal(tokens.space.margin, 9);
    assert.equal(tokens.space.gap, TOKEN_SCHEMA.space.gap.default, 'from the built-in root');
    assert.deepEqual(
      {
        family: tokens.font.heading.family,
        weight: tokens.font.heading.weight,
        upper: tokens.font.heading.upper,
      },
      { family: 'Caveat', weight: 400, upper: true },
    );
  });

  it('inherits elements and defaults, replaced by name; joins font files', () => {
    const face = (family, file) => ({ family, weight: 400, file });
    const parent = kit('parent', {
      elements: {
        'lower-third': { layers: [text('parents')] },
        extra: { layers: [text('extra')] },
      },
      defaults: { captions: 'extra', bug: 'bug' },
      fonts: [face('One', 'parent-one.ttf'), face('Two', 'two.ttf')],
    });
    const child = kit('child', {
      extends: 'parent',
      elements: { 'lower-third': { layers: [text('childs')] } },
      defaults: { captions: 'caption' },
      fonts: [face('One', 'child-one.ttf')],
    });
    const effective = resolveKit([child, parent]);
    assert.equal(effective.elements['lower-third'].layers[0].id, 'childs', 'replaced whole');
    assert.equal(effective.elements.extra.layers[0].id, 'extra');
    assert.ok(effective.elements.title, 'the root gives the standard elements');
    assert.equal(effective.defaults.captions, 'caption');
    assert.equal(effective.defaults.bug, 'bug');
    assert.equal(effective.defaults.intro, 'intro');
    assert.deepEqual(
      effective.fonts.map((f) => f.file),
      ['child-one.ttf', 'two.ttf'],
    );
  });

  it('derives the colours a kit leaves out, and keeps those it sets', () => {
    const yellow = resolveKit(kit('y', { tokens: { color: { primary: '#facc15' } } }));
    assert.equal(yellow.tokens.color.onPrimary, '#000000');
    const navy = resolveKit(kit('n', { extends: 'y', tokens: { color: { primary: '#0b1220' } } }));
    assert.equal(navy.tokens.color.onPrimary, '#ffffff', 'derived from the child colour');
    const set = kit('s', { tokens: { color: { primary: '#facc15', onPrimary: '#7c2d12' } } });
    assert.equal(resolveKit(set).tokens.color.onPrimary, '#7c2d12');
    assert.equal(resolveKit([kit('c', { extends: 's' }), set]).tokens.color.onPrimary, '#7c2d12');
  });

  it('allows five kits in a chain and refuses a sixth, and a loop', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i, all) => kit(id, { extends: all[i + 1] || '' }));
    assert.deepEqual(resolveKit(four).chain, ['a', 'b', 'c', 'd', 'clean']);
    assert.throws(() => resolveKit([kit('z'), ...four]), /longer than 5/);
    assert.throws(() => resolveKit([kit('a'), kit('b'), kit('a')]), /extends itself/);
  });
});

describe('kitChain', () => {
  const library = new Map(
    [
      kit('a', { extends: 'b' }),
      kit('b', { extends: 'c' }),
      kit('c', { extends: 'builtin:documentary' }),
      kit('loop1', { extends: 'loop2' }),
      kit('loop2', { extends: 'loop1' }),
      kit('self', { extends: 'self' }),
      kit('orphan', { extends: 'gone' }),
      ...['d1', 'd2', 'd3', 'd4', 'd5'].map((id, i) =>
        kit(id, { extends: i < 4 ? `d${i + 2}` : '' }),
      ),
    ].map((one) => [one.id, one]),
  );
  const lookup = (id) => library.get(id);

  it('follows extends down to the built-in root', () => {
    const ids = (id) => kitChain(library.get(id), lookup).map((one) => one.id);
    assert.deepEqual(ids('a'), ['a', 'b', 'c', 'documentary']);
    assert.deepEqual(kitChain(builtinKit('bold')), [builtinKit('bold')]);
    assert.deepEqual(
      kitChain(kit('free')).map((one) => one.id),
      ['free', 'clean'],
    );
    assert.equal(
      resolveKit(kitChain(library.get('a'), lookup)).tokens.font.heading.family,
      'Playfair Display',
    );
  });

  it('refuses loops, chains that are too long and kits that are missing', () => {
    assert.throws(() => kitChain(library.get('loop1'), lookup), /extends itself/);
    assert.throws(() => kitChain(library.get('self'), lookup), KitError);
    assert.throws(() => kitChain(library.get('orphan'), lookup), /was not found/);
    assert.throws(() => kitChain(library.get('d1'), lookup), /more than 5/);
    assert.throws(() => kitChain(kit('x', { extends: 'somewhere' })), KitError);
  });
});

describe('kitKey', () => {
  const base = () => ({ id: 'acme', name: 'Acme', tokens: { color: { primary: '#ff0066' } } });
  const keyOf = (raw) => kitKey(resolveKit(normalizeKit(raw)));

  it('is 20 hex digits, the same for the same kit however it is written', () => {
    const key = keyOf(base());
    assert.match(key, KEY_PATTERN);
    assert.equal(keyOf(base()), key);
    assert.equal(
      keyOf({ tokens: { color: { primary: '#FF0066' } }, name: 'Other', id: 'other' }),
      key,
    );
    const effective = resolveKit(normalizeKit(base()));
    assert.equal(kitKey(effective), kitKey(effective), 'remembered per kit object');
  });

  it('changes with everything that changes a picture or a sound, and nothing else', () => {
    const key = keyOf(base());
    const changed = (patch) => keyOf({ ...base(), ...patch });
    assert.notEqual(changed({ tokens: { color: { primary: '#ff0067' } } }), key);
    assert.notEqual(changed({ tokens: { ...base().tokens, sound: { style: 'lofi' } } }), key);
    assert.notEqual(changed({ fonts: [{ family: 'A', weight: 400, file: 'a.ttf' }] }), key);
    assert.notEqual(changed({ extends: 'builtin:bold' }), key);
    const element = {
      label: 'One',
      slots: { a: { label: 'A', sample: 'x' } },
      layers: [text('t')],
    };
    const withElement = changed({ elements: { mine: element } });
    assert.notEqual(withElement, key);
    const relabelled = {
      ...element,
      label: 'Two',
      slots: { a: { label: 'B', sample: 'y', max: 9 } },
    };
    assert.equal(
      changed({ elements: { mine: relabelled } }),
      withElement,
      'labels and samples are not seen',
    );
    assert.notEqual(changed({ elements: { mine: { ...element, slots: { b: {} } } } }), withElement);
    assert.equal(changed({ defaults: { captions: 'title' } }), key, 'nor what the tools reach for');
    assert.notEqual(
      kitKey(resolveKit(normalizeKit(base())), BRAND_VERSION + 1),
      key,
      'the language version is',
    );
  });
});
