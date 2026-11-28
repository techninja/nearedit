import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAPTION_STYLE, PRESET_NAMES } from '#utils/captions/style.js';
import { patchCaptionStyle } from '#utils/edl/index.js';
import { testEdl } from '#utils/edl/testkit.js';
import { changedPaths, fontChoices, presetOf, styleSections } from './styleControls.js';

describe('the caption style as an editor shows it', () => {
  it('has a control for every field of the table, in the table’s sections', () => {
    const sections = styleSections(undefined);
    assert.deepEqual(
      sections.map((section) => section.title),
      ['Text', 'Outline and shadow', 'Plate', 'Word being said', 'Groups', 'Position', 'Motion'],
    );
    const paths = sections.flatMap((section) => section.controls.map((control) => control.name));
    // Everything but the preset (tiles choose it) and what a `when` hides.
    const hidden = ['plate.color', 'plate.opacity', 'plate.padding', 'plate.radius', 'highlight.scale'];
    assert.deepEqual(
      paths,
      Object.keys(CAPTION_STYLE).filter((path) => path !== 'preset' && !hidden.includes(path)),
    );
    const size = sections[0].controls.find((control) => control.name === 'size');
    assert.deepEqual(
      [size.path, size.type, size.value, size.label, size.slider, size.spec.unit],
      ['captions.style.size', 'number', 5.2, 'Size', true, 'u'],
    );
    assert.ok(sections.every((section) => section.changed === 0));
  });

  it('shows the values of the style in force, and what a preset’s switches reveal', () => {
    for (const name of PRESET_NAMES) assert.equal(presetOf(name).name, name);
    const pop = styleSections({ preset: 'pop' });
    const byName = Object.fromEntries(pop.flatMap((s) => s.controls).map((c) => [c.name, c.value]));
    assert.deepEqual(
      [byName.size, byName.case, byName['highlight.mode'], byName['highlight.scale']],
      [7.4, 'upper', 'scale', 1.12],
    );
    const boxed = styleSections('boxed').find((section) => section.title === 'Plate');
    assert.equal(boxed.controls.length, 5);
    assert.equal(presetOf({ preset: 'nonsense' }).label, 'Clean');
  });

  it('counts what differs from the preset, section by section', () => {
    let doc = testEdl({});
    doc = patchCaptionStyle(doc, 'size', 9);
    doc = patchCaptionStyle(doc, 'color', '#ff0000');
    doc = patchCaptionStyle(doc, 'highlight.mode', 'box');
    const stored = doc.captions.style;
    assert.deepEqual(changedPaths(stored), ['size', 'color', 'highlight.mode']);
    assert.deepEqual(
      styleSections(stored).map((section) => section.changed),
      [2, 0, 0, 1, 0, 0, 0],
    );
    // Back at the preset's own value, a field no longer counts.
    assert.deepEqual(changedPaths(patchCaptionStyle(doc, 'size', 5.2).captions.style), [
      'color',
      'highlight.mode',
    ]);
    assert.deepEqual(changedPaths({ preset: 'pop' }), []);
  });

  it('offers bundled fonts, the document’s own, and keeps a family it does not know', () => {
    const bundled = fontChoices(undefined, 'Inter');
    assert.equal(bundled.length, 1);
    assert.ok(bundled[0].families.includes('Inter') && bundled[0].families.includes('Bebas Neue'));
    const fonts = [
      { family: 'Brand Sans', weight: 400, style: 'normal', file: '/p/brand.woff2' },
      { family: 'Brand Sans', weight: 700, style: 'normal', file: '/p/brand-bold.woff2' },
      { family: 'Inter', weight: 400, style: 'normal', file: '/p/inter.woff2' },
    ];
    assert.deepEqual(fontChoices(fonts, 'brand sans')[1], {
      label: 'This document',
      families: ['Brand Sans'],
    });
    assert.deepEqual(fontChoices(fonts, 'Gone Grotesk').at(-1), {
      label: 'Not installed',
      families: ['Gone Grotesk'],
    });
  });
});
