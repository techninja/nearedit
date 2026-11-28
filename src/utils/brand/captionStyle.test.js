import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_PRESETS, PRESET_NAMES, resolveCaptionStyle } from '#utils/captions/index.js';
import {
  BUILTIN_KITS,
  TOKEN_SCHEMA,
  builtinKit,
  captionStyleOf,
  kitKey,
  normalizeKit,
  resolveKit,
  validateKit,
} from './index.js';

const effective = (id) => resolveKit(builtinKit(id));
const child = (tokens, parent = 'builtin:documentary') =>
  normalizeKit({ id: 'acme', name: 'Acme', extends: parent, tokens });

describe('the caption tokens', () => {
  it('are described in TOKEN_SCHEMA with types the token editor already draws', () => {
    const specs = TOKEN_SCHEMA.caption;
    assert.deepEqual(Object.keys(specs), ['preset', 'font', 'highlight', 'size', 'position']);
    assert.deepEqual(specs.preset.options, PRESET_NAMES);
    for (const spec of Object.values(specs)) {
      assert.ok(['select', 'number'].includes(spec.type) && spec.label && spec.description);
    }
    assert.deepEqual(specs.font.options, ['heading', 'body', 'preset']);
    assert.deepEqual(specs.highlight.options, ['accent', 'primary', 'text', 'preset']);
  });

  it('every built-in kit names a caption style of its own', () => {
    const presets = Object.fromEntries(
      BUILTIN_KITS.map(({ id }) => [id, effective(id).tokens.caption.preset]),
    );
    assert.deepEqual(presets, {
      clean: 'clean',
      bold: 'boxed',
      documentary: 'minimal',
      playful: 'pop',
    });
  });

  it('are inherited through extends, token by token, and are part of the kit key', () => {
    const parent = effective('documentary');
    const same = resolveKit([child({})]);
    assert.deepEqual(
      same.tokens.caption,
      parent.tokens.caption,
      'a child says nothing: all inherited',
    );
    const one = resolveKit([child({ caption: { highlight: 'accent' } })]);
    assert.deepEqual(one.tokens.caption, { ...parent.tokens.caption, highlight: 'accent' });
    assert.notEqual(kitKey(one), kitKey(same), 'a caption token changes the revision');
    // Through a chain of three: the grandchild's token wins, the rest comes from above.
    const middle = child({ caption: { preset: 'karaoke', size: 6 } }, 'builtin:clean');
    const leaf = normalizeKit({ id: 'show', extends: 'acme', tokens: { caption: { size: 7 } } });
    const chained = resolveKit([leaf, middle]);
    assert.deepEqual(
      [chained.tokens.caption.preset, chained.tokens.caption.size, chained.tokens.caption.font],
      ['karaoke', 7, 'heading'],
    );
  });

  it('are validated like every token: unknown values are errors, unknown names warnings', () => {
    const bad = {
      id: 'acme',
      tokens: { caption: { preset: 'disco', size: 'big', colour: 'red' } },
    };
    const { valid, problems } = validateKit(bad);
    assert.equal(valid, false);
    assert.deepEqual(
      problems.map((p) => [p.path, p.level]),
      [
        ['tokens.caption.preset', 'error'],
        ['tokens.caption.size', 'error'],
        ['tokens.caption.colour', 'warning'],
      ],
    );
    assert.deepEqual(normalizeKit(bad).tokens, {}, 'and nothing unusable is kept');
  });
});

describe('captionStyleOf', () => {
  it('gives what a document stores: the preset and what the brand changes in it', () => {
    assert.deepEqual(captionStyleOf(effective('clean')), {
      preset: 'clean',
      highlight: { color: '#f59e0b' },
    });
    assert.deepEqual(captionStyleOf(effective('documentary')), {
      preset: 'minimal',
      highlight: { color: '#c9a561' },
    });
  });

  it('takes the font from the kit: its family, its capitals, its size correction', () => {
    const bold = captionStyleOf(effective('bold'));
    assert.deepEqual(bold.font, { family: 'Bebas Neue' });
    assert.equal(bold.case, 'upper');
    assert.equal(bold.size, 6, 'the boxed size (4.6) × the font’s scale (1.3)');
    const playful = captionStyleOf(effective('playful'));
    assert.deepEqual([playful.preset, playful.font.family], ['pop', 'Caveat']);
    assert.equal(playful.highlight.color, '#e6226f', 'the kit’s primary, as it asks');
    // The weight stays the preset's: a caption style keeps its character.
    assert.equal(resolveCaptionStyle(playful).font.weight, CAPTION_PRESETS.pop.style.font.weight);
  });

  it('on a plate the words are the brand’s text on its surface, with its corners', () => {
    const bold = captionStyleOf(effective('bold'));
    assert.deepEqual(bold.plate, { color: '#111111', radius: 0 });
    assert.equal(bold.color, undefined, 'white is the preset’s own text colour');
    const light = captionStyleOf(
      resolveKit([child({ caption: { preset: 'boxed' } }, 'builtin:playful')]),
    );
    assert.deepEqual(light.plate, { color: '#ffffff', radius: 3 });
    assert.equal(light.color, '#1f1d3d');
  });

  it('honours the tokens that step away from the brand, and is safe on anything', () => {
    const own = captionStyleOf(
      resolveKit([
        child({ caption: { font: 'preset', highlight: 'preset', size: 8, position: 'top' } }),
      ]),
    );
    assert.deepEqual(own, { preset: 'minimal', size: 8, position: { anchor: 'top' } });
    for (const kit of [null, undefined, {}, { tokens: { caption: { preset: 'x' } } }]) {
      assert.deepEqual(captionStyleOf(/** @type {any} */ (kit)), { preset: 'clean' });
    }
    const custom = resolveKit([
      child({
        font: { heading: { family: 'Acme Sans', weight: 700 } },
        caption: { font: 'heading' },
      }),
    ]);
    assert.equal(captionStyleOf(custom).font.family, 'Acme Sans', 'a font of the kit’s own');
    assert.deepEqual(
      captionStyleOf(custom),
      captionStyleOf(custom),
      'the same kit, the same style',
    );
  });
});
