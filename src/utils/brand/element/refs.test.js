import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, normalizeKit, resolveElement, resolveKit } from '#utils/brand/index.js';
import { fill, isPresent, references, substitute } from './refs.js';
import { viewOf } from './view.js';

const TOKENS = {
  'color.primary': '#ff0066',
  'shape.radius': 1.5,
  'font.heading': { family: 'Inter' },
  'logo.mark': '',
};
const lookup = (path) => TOKENS[path];

describe('references', () => {
  it('a string that is one reference stands for the value itself, whatever its type', () => {
    assert.equal(substitute('{shape.radius}', lookup), 1.5);
    assert.deepEqual(substitute('{font.heading}', lookup), { family: 'Inter' });
    assert.equal(substitute('{logo.mark}', lookup), '');
    assert.equal(substitute('{color.nope}', lookup), '{color.nope}', 'unknown: left as written');
  });

  it('inside a longer string a reference is written out', () => {
    assert.equal(substitute('{color.primary}cc', lookup), '#ff0066cc');
    assert.equal(substitute('r={shape.radius}, {color.primary}', lookup), 'r=1.5, #ff0066');
    assert.equal(substitute('{logo.mark}{color.nope}', lookup), '{color.nope}');
    assert.equal(
      substitute('a {font.heading} b', lookup),
      'a {font.heading} b',
      'an object is not text',
    );
    assert.equal(substitute('no braces', lookup), 'no braces');
    assert.equal(substitute('{ not a ref } {} {1x}', lookup), '{ not a ref } {} {1x}');
  });

  it('fills a whole value in, sharing what holds no reference', () => {
    const still = { w: 4, deep: { list: [1, 'two'] } };
    const value = { fill: '{color.primary}', plate: { radius: '{shape.radius}' }, still };
    const filled = fill(value, lookup);
    assert.deepEqual(filled, { fill: '#ff0066', plate: { radius: 1.5 }, still });
    assert.equal(filled.still, still);
    assert.equal(fill(still, lookup), still);
    assert.deepEqual(references(value), ['color.primary', 'shape.radius']);
    assert.deepEqual(references('{slot.a} and {slot.a}, {slot.b}'), ['slot.a', 'slot.b']);
  });

  it('is one pass: what was filled in is never read again', () => {
    const slots = { name: '{color.primary} {slot.role}', role: 'x' };
    const design = { layers: [{ type: 'text', text: 'Hi {slot.name}' }], slots: ['name', 'role'] };
    const [layer] = viewOf(design, slots, 'wide').layers;
    assert.equal(layer.text, 'Hi {color.primary} {slot.role}');
  });

  it('knows what counts as present for when / unless', () => {
    assert.deepEqual(['', '  ', 'x', 0, 2, true, false, null, undefined, {}].map(isPresent), [
      false,
      false,
      true,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('resolveElement', () => {
  const acme = normalizeKit({
    id: 'acme',
    tokens: {
      color: { primary: '#ff0066' },
      font: { heading: { family: 'Acme Sans', weight: 700 } },
      logo: { mark: '/kits/acme/mark.png' },
    },
    fonts: [
      { family: 'Acme Sans', weight: 700, file: '/kits/acme/Bold.woff2' },
      { family: 'Unused', weight: 400, file: '/kits/acme/Unused.woff2' },
    ],
    elements: {
      card: {
        label: 'Card',
        kind: 'overlay',
        duration: 4,
        slots: { name: { label: 'Name', sample: 'Ada' }, note: { optional: true } },
        layers: [
          { id: 'logo', type: 'image', when: '{logo.mark}', src: '{logo.mark}', h: 8 },
          { id: 'drawn', type: 'shape', unless: '{logo.mark}', w: 8, h: 8 },
          {
            id: 'name',
            type: 'text',
            text: '{slot.name}',
            font: '{font.heading}',
            color: '{color.primary}',
            radius: '{shape.radius}',
          },
          {
            id: 'note',
            type: 'text',
            when: '{slot.note}',
            text: '{slot.note}',
            font: '{font.body}',
          },
        ],
        formats: { tall: { layers: { name: { size: 7, when: '{logo.main}' } } } },
      },
    },
  });
  const kit = resolveKit(acme);
  const design = resolveElement(kit, 'card');

  it('fills every token in and leaves the slots', () => {
    assert.deepEqual(references(design), ['slot.name', 'slot.note']);
    const name = design.layers.find((layer) => layer.id === 'name');
    assert.equal(name.color, '#ff0066');
    assert.equal(name.radius, 1.2, 'inherited from the built-in root');
    assert.equal(name.font.family, 'Acme Sans');
    assert.deepEqual(design.slots, ['name', 'note']);
    assert.equal(design.kind, 'overlay');
    assert.equal(design.duration, 4);
    assert.equal(design.margin, 6);
    assert.deepEqual(design.motion, { by: 'word', ease: 'ease-out', speed: 1 });
    assert.equal(design.label, undefined, 'labels stay with the kit');
  });

  it('settles what hangs on a token and keeps what waits for a slot', () => {
    assert.deepEqual(
      design.layers.map((layer) => layer.id),
      ['logo', 'name', 'note'],
    );
    assert.equal(design.layers[0].src, '/kits/acme/mark.png');
    assert.equal('when' in design.layers[0], false, 'a settled condition is gone');
    assert.equal(design.layers[2].when, '{slot.note}');
    assert.equal(
      design.formats.tall.layers.name.when,
      false,
      'decided, but still a switch per format',
    );
    const plain = resolveElement(resolveKit(normalizeKit({ ...acme, tokens: {} })), 'card');
    assert.deepEqual(
      plain.layers.map((layer) => layer.id),
      ['drawn', 'name', 'note'],
    );
  });

  it('lists the font files its text needs, and only those', () => {
    assert.deepEqual(design.fonts, [
      { family: 'Acme Sans', weight: 700, style: 'normal', file: '/kits/acme/Bold.woff2' },
    ]);
    assert.equal(resolveElement(resolveKit(builtinKit('clean')), 'title').fonts, undefined);
  });

  it('gives the same design object for the same kit, and null for what is not there', () => {
    assert.equal(resolveElement(kit, 'card'), design);
    assert.notEqual(resolveElement(resolveKit(acme), 'card'), design);
    assert.deepEqual(resolveElement(resolveKit(acme), 'card'), design);
    assert.equal(resolveElement(kit, 'nope'), null);
    assert.equal(resolveElement(kit, 'constructor'), null);
    assert.equal(resolveElement(null, 'card'), null);
    assert.equal(resolveElement(kit, 7), null);
  });
});
