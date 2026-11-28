import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { facesFor } from './fontLoader.js';
import { createFontRegistrar } from './fontRegistrar.js';
import { customFamily, customFamilyNames } from './fontFaces.js';
import { fontString, resolveFamily } from './fonts.js';
import { textStyle } from './text/style.js';

const TABLE = [
  { family: 'Acme Sans', weight: 400, style: 'normal', file: '/kit/Regular.woff2' },
  { family: 'Acme Sans', weight: 700, style: 'normal', file: '/kit/Bold.woff2' },
  { family: 'Acme Sans', weight: 400, style: 'italic', file: '/kit/Italic.woff2' },
  { family: 'Slanted', weight: 500, style: 'italic', file: '/kit/Slanted.ttf' },
];

describe("a document's own fonts", () => {
  it('are found before the bundled families', () => {
    assert.equal(resolveFamily('acme sans', TABLE).id, 'Acme Sans');
    assert.deepEqual(resolveFamily('Acme Sans', TABLE).weights, [400, 700]);
    assert.deepEqual(resolveFamily('Acme Sans', TABLE).italicWeights, [400]);
    assert.equal(resolveFamily('Acme Sans').id, 'Inter', 'without the table the family is unknown');
    assert.equal(resolveFamily('Inter', TABLE).custom, undefined);
    assert.deepEqual(customFamilyNames(TABLE), ['Acme Sans', 'Slanted']);
    assert.equal(customFamily([], 'acme sans'), undefined);
    assert.equal(customFamily(undefined, 'acme sans'), undefined);
    assert.deepEqual(
      resolveFamily('Slanted', TABLE).weights,
      [500],
      'a family that comes only in italics',
    );
  });

  it('give a font string that names a face there is a file for, then the bundled fallback', () => {
    const font = (style) =>
      fontString({ fontFamily: 'Acme Sans', fontSize: 40, fonts: TABLE, ...style });
    assert.equal(font({ weight: 600 }), '700 40px "Acme Sans", "Inter", "Noto Color Emoji"');
    assert.equal(font({ weight: 100 }), '400 40px "Acme Sans", "Inter", "Noto Color Emoji"');
    assert.equal(
      font({ weight: 900, italic: true }),
      'italic 400 40px "Acme Sans", "Inter", "Noto Color Emoji"',
    );
    assert.equal(
      fontString({ fontFamily: 'Acme Sans', fontSize: 40 }),
      '400 40px "Inter", "Noto Color Emoji"',
    );
    const style = textStyle({ content: 'x', fontFamily: 'Acme Sans', weight: 700 }, TABLE);
    assert.equal(fontString(style), '700 72px "Acme Sans", "Inter", "Noto Color Emoji"');
    assert.equal('fonts' in textStyle({ content: 'x' }), false, 'no table, no trace of it');
  });
});

describe('createFontRegistrar', () => {
  /** A fake FontFaceSet and FontFace. */
  function setup() {
    const faces = [];
    const set = {
      add: (face) => faces.push(face),
      delete: (face) => faces.splice(faces.indexOf(face), 1),
    };
    const made = [];
    const make = (family, source, descriptors) => {
      const face = {
        family,
        source,
        ...descriptors,
        status: 'unloaded',
        loaded: new Promise(() => {}),
      };
      made.push(face);
      return face;
    };
    let changes = 0;
    const register = createFontRegistrar(
      set,
      make,
      (file) => `/api/media/file?path=${encodeURIComponent(file)}`,
      () => changes++,
    );
    return { faces, made, register, changes: () => changes };
  }

  it('adds each face once, pointing at its file on the media route', () => {
    const { faces, register, changes } = setup();
    register(TABLE);
    assert.equal(faces.length, 4);
    assert.deepEqual(
      [faces[1].family, faces[1].weight, faces[1].style, faces[1].source],
      ['Acme Sans', '700', 'normal', 'url("/api/media/file?path=%2Fkit%2FBold.woff2")'],
    );
    register(TABLE);
    register([...TABLE]);
    assert.equal(faces.length, 4, 'a table that was seen, and faces that are there, cost nothing');
    assert.equal(changes(), 1);
    // The loader then finds the face a text needs by family, weight and style.
    const needed = facesFor(
      faces,
      fontString({ fontFamily: 'Acme Sans', weight: 700, fonts: TABLE }),
      'Hi',
    );
    assert.deepEqual(
      needed.map((face) => face.source),
      [faces[1].source],
    );
  });

  it('replaces a face that comes with another file, and never a bundled family', () => {
    const { faces, register, changes } = setup();
    register(TABLE.slice(0, 2));
    register([
      { ...TABLE[1], file: '/kit/Bold-v2.woff2' },
      { family: 'Inter', weight: 400, style: 'normal', file: '/x/evil.ttf' },
    ]);
    assert.deepEqual(faces.map((face) => face.source).sort(), [
      'url("/api/media/file?path=%2Fkit%2FBold-v2.woff2")',
      'url("/api/media/file?path=%2Fkit%2FRegular.woff2")',
    ]);
    assert.equal(changes(), 2);
    for (const junk of [null, 'fonts', [null, 7, {}, { family: 'A' }]]) register(junk);
    assert.equal(faces.length, 2);
  });

  it('reports a file that cannot be loaded, once', async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      const set = { add() {}, delete() {} };
      const failing = () => ({ loaded: Promise.reject(new Error('404')) });
      createFontRegistrar(set, failing, (file) => file)([TABLE[0]]);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      console.warn = warn;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Regular\.woff2.*"Acme Sans" is drawn in the fallback font/);
  });
});
