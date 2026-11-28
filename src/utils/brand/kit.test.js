import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  TOKEN_SCHEMA,
  defaultTokens,
  normalizeKit,
  tokenValue,
  validateKit,
} from './index.js';
import { cleanFonts, isCustomFamily, mergeFonts } from './fontTable.js';
import { kitFiles, mapKitFiles } from './files.js';
import { cleanToken, cleanTokens } from './tokenClean.js';

const ACME = {
  id: 'acme',
  name: 'Acme',
  extends: 'builtin:clean',
  tokens: {
    color: { primary: '#4F46E5', accent: '#f59e0b' },
    font: { heading: { family: 'Acme Sans', weight: 700 } },
    logo: { main: 'logo.png', mark: 'mark.png' },
    shape: { radius: 1.2 },
    motion: { enter: 'slide-up', speed: 1 },
  },
  fonts: [{ family: 'Acme Sans', weight: 700, file: 'fonts/AcmeSans-Bold.woff2' }],
  elements: {
    badge: {
      label: 'Badge',
      kind: 'overlay',
      slots: { text: { label: 'Text' } },
      layers: [
        { type: 'image', src: 'art/star.png', at: 'top-left', h: 8 },
        { type: 'text', text: '{slot.text}', font: '{font.heading}', color: '{color.primary}' },
      ],
    },
  },
  defaults: { captions: 'caption', badge: 'badge' },
};

describe('TOKEN_SCHEMA', () => {
  it('describes every token so an editor can be generated from it', () => {
    assert.deepEqual(Object.keys(TOKEN_SCHEMA), [
      'color',
      'font',
      'logo',
      'shape',
      'space',
      'motion',
      'sound',
    ]);
    for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
      for (const [name, spec] of Object.entries(specs)) {
        const at = `${group}.${name}`;
        assert.ok(spec.label && spec.type, `${at} has a label and a type`);
        if (spec.type === 'number') assert.ok(spec.min < spec.max, `${at} has a range`);
        if (spec.type === 'select') assert.ok(spec.options.includes(spec.default), `${at} default`);
        if (spec.derived)
          assert.ok(TOKEN_SCHEMA.color[spec.derived], `${at} derives from a colour`);
        else
          assert.deepEqual(cleanToken(spec, spec.default), spec.default, `${at} default is usable`);
      }
    }
    assert.equal(
      tokenValue({ tokens: defaultTokens() }, 'color.primary'),
      TOKEN_SCHEMA.color.primary.default,
    );
    assert.equal(tokenValue({ tokens: defaultTokens() }, 'font.heading.family'), 'Inter');
    assert.equal(
      tokenValue({ tokens: defaultTokens() }, 'color.onPrimary'),
      undefined,
      'derived later',
    );
    assert.equal(tokenValue({ tokens: defaultTokens() }, 'color.toString'), undefined);
    assert.equal(tokenValue(null, 'color.primary'), undefined);
  });
});

describe('normalizeKit', () => {
  it('keeps what a kit says and fills nothing in', () => {
    const kit = normalizeKit(ACME);
    assert.equal(kit.id, 'acme');
    assert.equal(kit.extends, 'builtin:clean');
    assert.deepEqual(kit.tokens.color, { primary: '#4f46e5', accent: '#f59e0b' });
    assert.deepEqual(kit.tokens.font, { heading: { family: 'Acme Sans', weight: 700 } });
    assert.deepEqual(kit.fonts, [
      { family: 'Acme Sans', weight: 700, style: 'normal', file: 'fonts/AcmeSans-Bold.woff2' },
    ]);
    assert.deepEqual(Object.keys(kit.elements), ['badge']);
    assert.equal(kit.elements.badge.layers.length, 2);
    assert.deepEqual(kit.defaults, { captions: 'caption', badge: 'badge' });
    assert.deepEqual(normalizeKit(kit), kit, 'normalising twice changes nothing');
    assert.deepEqual(normalizeKit(JSON.parse(JSON.stringify(kit))), kit);
  });

  it('turns anything into a kit', () => {
    const empty = {
      id: '',
      name: '',
      extends: '',
      tokens: {},
      fonts: [],
      elements: {},
      defaults: {},
    };
    for (const raw of [null, undefined, 7, 'kit', [], () => {}, new Date()]) {
      assert.deepEqual(normalizeKit(raw), empty);
    }
  });

  it('drops what is hostile, wrong or too much', () => {
    const hostile = JSON.parse(
      '{"id":"../../etc","extends":"builtin:../x","__proto__":{"polluted":true},' +
        '"tokens":{"__proto__":{"x":1},"color":{"primary":"red","text":"#fff","constructor":"#000"},' +
        '"font":{"heading":{"family":7,"weight":"heavy","scale":99}},"shape":{"radius":1e9},' +
        '"motion":{"enter":"explode","speed":-3}},' +
        '"defaults":{"captions":{"toString":1},"ok":"caption","bad id":"x"}}',
    );
    hostile.fonts = [...Array(500)].map((_, i) => ({
      family: `F${i}`,
      weight: i,
      file: `f${i}.ttf`,
    }));
    hostile.elements = Object.fromEntries([...Array(200)].map((_, i) => [`e${i}`, { layers: [] }]));
    hostile.elements.wide = { layers: [...Array(500)].map(() => ({ type: 'shape' })) };
    const kit = normalizeKit(hostile);
    assert.equal(kit.id, '');
    assert.equal(kit.extends, '');
    assert.equal({}.polluted, undefined);
    assert.deepEqual(kit.tokens.color, { text: '#fff' });
    assert.deepEqual(kit.tokens.font, { heading: { scale: 2.5 } }, 'numbers are clamped');
    assert.deepEqual(kit.tokens.shape, { radius: 20 });
    assert.deepEqual(kit.tokens.motion, { speed: 0.25 });
    assert.equal(kit.fonts.length, LIMITS.fonts);
    assert.equal(Object.keys(kit.elements).length, LIMITS.elements);
    assert.deepEqual(kit.defaults, { ok: 'caption' });
    const { wide } = normalizeKit({ elements: { wide: hostile.elements.wide } }).elements;
    assert.equal(wide.layers.length, LIMITS.layers);
  });

  it('reads tokens one by one', () => {
    assert.deepEqual(cleanTokens({ colour: { primary: '#fff' }, color: 'blue' }), {});
    assert.equal(cleanToken(TOKEN_SCHEMA.space.margin, '8'), 8);
    assert.equal(cleanToken(TOKEN_SCHEMA.space.margin, NaN), undefined);
    assert.equal(cleanToken(TOKEN_SCHEMA.logo.initials, 'ABCDEFG'), 'ABCD');
    assert.deepEqual(cleanToken(TOKEN_SCHEMA.font.body, 'Caveat'), { family: 'Caveat' });
  });
});

describe('font tables', () => {
  it('keep usable files, each face once, and never a bundled family', () => {
    const fonts = cleanFonts([
      { family: 'Acme Sans', weight: 700, file: 'a.woff2' },
      { family: 'acme sans', weight: 700, file: 'again.woff2' },
      { family: 'Acme Sans', weight: 700, style: 'italic', file: 'i.otf' },
      { family: 'Inter', weight: 400, file: 'my-inter.ttf' },
      { family: 'sans-serif', file: 'x.ttf' },
      { family: 'Evil"; src: url(x)', file: 'e.ttf' },
      { family: 'Script', file: 'payload.js' },
      { family: 'Wide', weight: 99999, file: 'w.woff' },
      'Acme',
      null,
    ]);
    assert.deepEqual(
      fonts.map((face) => `${face.family} ${face.weight} ${face.style} ${face.file}`),
      ['Acme Sans 700 normal a.woff2', 'Acme Sans 700 italic i.otf', 'Wide 1000 normal w.woff'],
    );
    assert.equal(isCustomFamily('Noto Color Emoji'), false);
    assert.equal(isCustomFamily('Playfair display'), false);
    assert.equal(isCustomFamily('Acme'), true);
    const merged = mergeFonts([{ family: 'A', weight: 400, file: 'child.ttf' }], fonts, undefined);
    assert.equal(merged.length, 4);
    assert.equal(
      mergeFonts(fonts, [{ family: 'Acme Sans', weight: 700, file: 'late.ttf' }])[0].file,
      'a.woff2',
    );
  });
});

describe('kit files', () => {
  it('finds and maps every path a kit names', () => {
    const kit = normalizeKit(ACME);
    assert.deepEqual(kitFiles(kit).sort(), [
      'art/star.png',
      'fonts/AcmeSans-Bold.woff2',
      'logo.png',
      'mark.png',
    ]);
    const seen = [];
    const mapped = mapKitFiles(kit, (path, where) => (seen.push(where), `/kits/acme/${path}`));
    assert.deepEqual(seen, [
      'tokens.logo.main',
      'tokens.logo.mark',
      'fonts[0].file',
      'elements.badge.layers[0].src',
    ]);
    assert.equal(mapped.tokens.logo.main, '/kits/acme/logo.png');
    assert.equal(mapped.fonts[0].file, '/kits/acme/fonts/AcmeSans-Bold.woff2');
    assert.equal(mapped.elements.badge.layers[0].src, '/kits/acme/art/star.png');
    assert.equal(kit.tokens.logo.main, 'logo.png', 'the kit itself is not changed');
    const sprite = {
      type: 'generator',
      generator: 'particles',
      params: { sprite: 'image', image: 'p.png' },
    };
    const withSprite = normalizeKit({
      elements: { fx: { layers: [sprite, { type: 'image', src: '{logo.mark}' }] } },
    });
    assert.deepEqual(kitFiles(withSprite), ['p.png'], 'a reference is not a path');
  });
});

describe('validateKit', () => {
  it('accepts a kit that is written well', () => {
    assert.deepEqual(validateKit(ACME), { valid: true, problems: [] });
  });

  it('says what is wrong, and where', () => {
    const { valid, problems } = validateKit({
      id: 'not an id',
      extends: 'builtin:../x',
      colour: 'blue',
      tokens: { color: { primary: 'red', brand: '#fff' }, colour: {}, logo: { main: 'logo.svg' } },
      fonts: [
        { family: 'Inter', file: 'a.woff2' },
        { family: 'A', file: 'a.exe' },
      ],
      elements: {
        a: {
          slots: { name: {} },
          layers: [
            {
              type: 'text',
              text: '{slot.nope} {color.nope}',
              in: 'g',
              around: 'x',
              enter: 'jump',
              wat: 1,
            },
          ],
        },
        b: { layers: [] },
        c: {
          kind: 'film',
          duration: 0,
          layers: [{ type: 'hologram' }, { type: 'generator', generator: 'sparkle' }],
        },
      },
    });
    assert.equal(valid, false);
    const at = (path) => problems.filter((problem) => problem.path === path).map((p) => p.level);
    assert.deepEqual(at('id'), ['error']);
    assert.deepEqual(at('extends'), ['error']);
    assert.deepEqual(at('colour'), ['warning']);
    assert.deepEqual(at('tokens.color.primary'), ['error']);
    assert.deepEqual(at('tokens.color.brand'), ['warning']);
    assert.deepEqual(at('tokens.colour'), ['warning']);
    assert.deepEqual(at('tokens.logo.main'), ['error']);
    assert.deepEqual(at('fonts[0]'), ['error']);
    assert.deepEqual(at('fonts[1]'), ['error']);
    assert.deepEqual(at('elements.a.layers[0].wat'), ['warning']);
    assert.deepEqual(at('elements.a.layers[0].enter'), ['error']);
    assert.deepEqual(at('elements.a.layers[0].in'), ['error']);
    assert.deepEqual(at('elements.a.layers[0].around'), ['error']);
    assert.equal(at('elements.a.layers[0]').length, 2, 'a slot and a token that do not exist');
    assert.deepEqual(at('elements.b.layers'), ['error']);
    assert.deepEqual(at('elements.c.kind'), ['error']);
    assert.deepEqual(at('elements.c.duration'), ['error']);
    assert.deepEqual(at('elements.c.layers[0].type'), ['error']);
    assert.deepEqual(at('elements.c.layers[1].generator'), ['error']);
    assert.equal(validateKit(null).valid, false);
  });
});
