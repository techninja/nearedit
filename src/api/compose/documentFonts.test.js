import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { title } from '../../../tests/compose/build.js';
import { doc } from '../../../tests/compose/build.js';
import { FONT_DIR, registerDocumentFonts, renderFrame } from './index.js';

const FILE = join(FONT_DIR, 'caveat/caveat-latin-700-normal.woff2');
const face = (family, file = FILE) => ({ family, weight: 700, style: 'normal', file });
/** A title in a family, with a font table; returns the frame's pixels. */
function drawn(family, fonts) {
  const edl = doc(
    [[title('t', 'Hamburgefonstiv', { fontFamily: family, weight: 700, fontSize: 160 })]],
    { fonts },
  );
  return renderFrame(edl, 1, { width: 480 }).getContext('2d').getImageData(0, 0, 480, 270).data;
}
const same = (a, b) => a.every((value, i) => value === b[i]);
/** Run something with console.warn collected. */
function quietly(run) {
  const warn = console.warn;
  const messages = [];
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    return { value: run(), messages };
  } finally {
    console.warn = warn;
  }
}

describe("a document's own fonts on the server canvas", () => {
  it('are registered under their family name and drawn', () => {
    const fonts = [face('Brand Hand')];
    assert.deepEqual(registerDocumentFonts(fonts), []);
    assert.ok(GlobalFonts.has('Brand Hand'));
    assert.deepEqual(registerDocumentFonts(fonts), [], 'a table that was seen costs nothing');
    const custom = drawn('Brand Hand', fonts);
    assert.ok(!same(custom, drawn('Inter', undefined)), 'not the fallback');
    assert.ok(same(custom, drawn('Caveat', undefined)), 'the very face the file holds');
    assert.ok(
      same(drawn('Brand Hand', undefined), drawn('sans-serif', undefined)),
      'unknown without the table',
    );
  });

  it('fall back with one warning when the file is missing, and still draw', () => {
    const fonts = [face('Gone Sans', '/nowhere/Gone.woff2')];
    const first = quietly(() => drawn('Gone Sans', fonts));
    assert.equal(first.messages.length, 1);
    assert.match(first.messages[0], /could not load font file \/nowhere\/Gone\.woff2.*fallback/);
    const again = quietly(() => drawn('Gone Sans', fonts));
    const other = quietly(() => drawn('Gone Sans', [face('Gone Sans', '/nowhere/Gone.woff2')]));
    assert.deepEqual([again.messages, other.messages], [[], []], 'said once');
    assert.ok(same(first.value, drawn('Inter', undefined)), 'drawn in the bundled sans-serif');
    assert.ok(
      first.value.some((value, i) => i % 4 === 0 && value > 200),
      'the text is there',
    );
  });

  it('report a file that is no font, and never redefine a bundled family', () => {
    const notFont = quietly(() =>
      registerDocumentFonts([face('Not A Font', join(FONT_DIR, 'fonts.json'))]),
    );
    assert.deepEqual(notFont.value, [join(FONT_DIR, 'fonts.json')]);
    assert.equal(notFont.messages.length, 1);
    const before = drawn('Inter', undefined);
    const hijack = quietly(() =>
      registerDocumentFonts([{ ...face('Inter'), weight: 700 }, null, 'x', {}]),
    );
    assert.deepEqual([hijack.value, hijack.messages], [[], []]);
    assert.ok(same(drawn('Inter', undefined), before), 'Inter is still Inter');
    assert.deepEqual(registerDocumentFonts(null), []);
  });

  it('replace a face that comes with another file', () => {
    registerDocumentFonts([face('Swap', FILE)]);
    const caveat = drawn('Swap', [face('Swap', FILE)]);
    const other = [face('Swap', join(FONT_DIR, 'bebas-neue/bebas-neue-latin-400-normal.woff2'))];
    registerDocumentFonts(other);
    assert.ok(!same(drawn('Swap', other), caveat));
  });
});
