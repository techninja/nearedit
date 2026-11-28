import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import {
  BUILTIN_KITS,
  STANDARD_DEFAULTS,
  STANDARD_ELEMENTS,
  TOKEN_SCHEMA,
  brandCatalog,
  builtinKit,
  expandElement,
  kitKey,
  resolveElement,
  resolveKit,
  validateDesign,
  validateKit,
} from './index.js';
import bold from './kits/bold/index.js';
import clean from './kits/clean/index.js';
import documentary from './kits/documentary/index.js';
import playful from './kits/playful/index.js';
import { references } from './element/refs.js';

const RAW = { clean, bold, documentary, playful };
const SLOTS = {
  ...{ name: 'Ada Lovelace', role: 'Mathematician', title: 'The Analytical Engine' },
  ...{
    subtitle: 'A short history',
    text: 'One line of what is being said',
    by: 'Ada',
    number: '01',
  },
};
const FRAMES = { wide: [1920, 1080], tall: [1080, 1920], square: [1080, 1080] };

describe('the built-in kits', () => {
  it('are clean, bold, documentary and playful', () => {
    assert.deepEqual(
      BUILTIN_KITS.map((kit) => kit.id),
      ['clean', 'bold', 'documentary', 'playful'],
    );
    for (const { id, name, description } of BUILTIN_KITS) {
      assert.ok(name && description.length > 20, id);
      assert.equal(builtinKit(id), builtinKit(`builtin:${id}`), 'the same object every time');
    }
    assert.equal(builtinKit('nope'), undefined);
    assert.deepEqual(STANDARD_ELEMENTS, [
      ...[
        'lower-third',
        'title',
        'caption',
        'quote',
        'chapter',
        'intro',
        'outro',
        'bug',
        'stinger',
      ],
    ]);
  });

  for (const id of Object.keys(RAW)) {
    describe(id, () => {
      const kit = resolveKit(builtinKit(id));

      it('is complete and valid, as written and as resolved', () => {
        assert.deepEqual(validateKit(RAW[id], { effective: kit }).problems, []);
        assert.deepEqual(kit.chain, [id]);
        for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
          for (const [name, spec] of Object.entries(specs)) {
            if (!spec.derived)
              assert.notEqual(builtinKit(id).tokens[group]?.[name], undefined, `${group}.${name}`);
          }
        }
        assert.deepEqual(Object.keys(kit.elements), STANDARD_ELEMENTS);
        assert.deepEqual(kit.defaults, STANDARD_DEFAULTS);
        assert.deepEqual(kit.fonts, [], 'only bundled fonts');
        const bundled = FONT_FAMILIES.map((family) => family.id);
        for (const font of Object.values(kit.tokens.font))
          assert.ok(bundled.includes(font.family), font.family);
        assert.equal(
          kit.tokens.logo.main + kit.tokens.logo.mark,
          '',
          'the logo is drawn, not a file',
        );
      });

      it('defines every standard element with the standard kind and slots', () => {
        const slots = (name) => Object.keys(kit.elements[name].slots);
        assert.deepEqual(slots('lower-third'), ['name', 'role']);
        assert.deepEqual(slots('title'), ['title', 'subtitle']);
        assert.deepEqual(slots('caption'), ['text']);
        assert.deepEqual(slots('quote'), ['text', 'by']);
        assert.deepEqual(slots('chapter'), ['title', 'number']);
        assert.deepEqual(slots('intro'), ['title', 'subtitle']);
        assert.deepEqual(slots('outro'), ['title', 'text']);
        assert.deepEqual([slots('bug'), slots('stinger')], [[], []]);
        const kinds = Object.fromEntries(
          STANDARD_ELEMENTS.map((name) => [name, kit.elements[name].kind]),
        );
        assert.deepEqual(kinds, {
          ...{ 'lower-third': 'overlay', title: 'overlay', caption: 'overlay', quote: 'overlay' },
          ...{ chapter: 'segment', intro: 'segment', outro: 'segment', bug: 'overlay' },
          stinger: 'transition',
        });
        assert.ok(kit.elements.stinger.cover > 0 && kit.elements.stinger.cover < 1);
      });

      it('resolves each into a small, self-contained design that draws in every format', () => {
        for (const name of STANDARD_ELEMENTS) {
          const design = resolveElement(kit, name);
          assert.deepEqual(validateDesign(design), [], `${name} is a sound design`);
          const tokens = references(design).filter((path) => !path.startsWith('slot.'));
          assert.deepEqual(tokens, [], `${name} refers to nothing but its slots`);
          assert.ok(
            JSON.stringify(design).length < 3000,
            `${name} is ${JSON.stringify(design).length} bytes`,
          );
          for (const [format, [width, height]] of Object.entries(FRAMES)) {
            const warnings = [];
            const clips = expandElement(design, SLOTS, {
              ...{ duration: design.duration, frame: { width, height } },
              warn: (message) => warnings.push(message),
            });
            assert.ok(clips.length > 0, `${name} draws in a ${format} frame`);
            assert.deepEqual(warnings, [], `${name} ${format}`);
          }
        }
      });
    });
  }

  it('differ from each other in type, colour, shape and motion', () => {
    const kits = BUILTIN_KITS.map(({ id }) => resolveKit(builtinKit(id)));
    const distinct = (pick) => new Set(kits.map((kit) => JSON.stringify(pick(kit)))).size;
    assert.equal(
      distinct((kit) => kitKey(kit)),
      4,
    );
    assert.equal(
      distinct((kit) => kit.tokens.font.heading.family),
      4,
    );
    assert.equal(
      distinct((kit) => kit.tokens.color.primary),
      4,
    );
    assert.equal(
      distinct((kit) => kit.tokens.motion),
      4,
    );
    assert.ok(distinct((kit) => kit.tokens.shape.radius) >= 3);
    for (const name of STANDARD_ELEMENTS) {
      assert.equal(
        distinct((kit) => resolveElement(kit, name).layers),
        4,
        `${name} is designed four times`,
      );
    }
  });

  it('are listed with their elements and slots for the command line and the director', () => {
    const listed = brandCatalog();
    assert.deepEqual(
      listed.map((kit) => kit.extends),
      ['builtin:clean', 'builtin:bold', 'builtin:documentary', 'builtin:playful'],
    );
    const third = listed[0].elements.find((element) => element.id === 'lower-third');
    assert.deepEqual(third, {
      ...{ id: 'lower-third', label: 'Lower third', kind: 'overlay', duration: 5 },
      slots: [
        { name: 'name', label: 'Name', optional: false },
        { name: 'role', label: 'Role', optional: true },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(listed)), listed);
  });
});
