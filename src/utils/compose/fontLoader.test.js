import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFontLoader, facesFor } from './fontLoader.js';
import { fontString } from './fonts.js';

/** A fake FontFaceSet: faces that load when the test says so. */
function fakeSet(faces) {
  const set = {
    faces,
    /** @type {{ font: string, text: string, finish: (ok?: boolean) => void }[]} */
    loads: [],
    checks: 0,
    [Symbol.iterator]: () => faces[Symbol.iterator](),
    // Chrome says "yes" when a font of that name is installed on the machine.
    check: () => ((set.checks += 1), true),
    load(font, text) {
      return new Promise((resolve, reject) => {
        const finish = (ok = true) => {
          for (const face of facesFor(set, font, text) || []) face.status = ok ? 'loaded' : 'error';
          return ok ? resolve([]) : reject(new Error('404'));
        };
        set.loads.push({ font, text, finish });
      });
    },
  };
  return set;
}
const face = (family, weight, style, unicodeRange) => ({
  family,
  weight: String(weight),
  style,
  unicodeRange,
  status: 'unloaded',
});
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153';
const CYRILLIC = 'U+0301, U+0400-045F';
const bundled = () => [
  face('Inter', 400, 'normal', LATIN),
  face('Inter', 700, 'normal', LATIN),
  face('Inter', 700, 'normal', CYRILLIC),
  face('Inter', 700, 'italic', LATIN),
  face('"Playfair Display"', 700, 'normal', LATIN),
  face('Noto Color Emoji', 400, 'normal', 'U+1F3A0-1F3FF, U+2764'),
  face('Noto Color Emoji', 400, 'normal', 'U+1F60?'),
];
const tick = () => new Promise((resolve) => setImmediate(resolve));
const BOLD = fontString({ fontFamily: 'Inter', bold: true });

describe('facesFor', () => {
  const set = fakeSet(bundled());
  const ranges = (font, text) =>
    facesFor(set, font, text).map(
      (f) => `${f.family} ${f.weight} ${f.style} ${f.unicodeRange.slice(0, 8)}`,
    );

  it('finds the face of the family, weight and style that covers the text', () => {
    assert.deepEqual(ranges(BOLD, 'Hello'), ['Inter 700 normal U+0000-0']);
    assert.deepEqual(ranges(fontString({ fontFamily: 'Inter' }), 'Hello'), [
      'Inter 400 normal U+0000-0',
    ]);
    assert.deepEqual(
      ranges(fontString({ fontFamily: 'Inter', bold: true, italic: true }), 'Hello'),
      ['Inter 700 italic U+0000-0'],
    );
    assert.deepEqual(ranges(fontString({ fontFamily: 'serif', bold: true }), 'Œuvre'), [
      '"Playfair Display" 700 normal U+0000-0',
    ]);
  });

  it('adds the subsets other scripts and emoji need', () => {
    assert.deepEqual(ranges(BOLD, 'Привет, Hello'), [
      'Inter 700 normal U+0000-0',
      'Inter 700 normal U+0301, ',
    ]);
    assert.deepEqual(ranges(BOLD, 'Go 🎬'), [
      'Inter 700 normal U+0000-0',
      'Noto Color Emoji 400 normal U+1F3A0-',
    ]);
    assert.deepEqual(ranges(BOLD, '😀'), ['Noto Color Emoji 400 normal U+1F60?']);
    assert.deepEqual(ranges(BOLD, '漢字'), [], 'nothing bundled covers it: the system falls back');
  });

  it('gives up on a font value it did not write', () => {
    assert.equal(facesFor(set, 'bold 2em/1.2 Georgia, serif', 'x'), null);
  });
});

describe('createFontLoader', () => {
  let set;
  let arrivals;
  let ready;
  beforeEach(() => {
    set = fakeSet(bundled());
    arrivals = 0;
    ready = createFontLoader(set, () => arrivals++);
  });

  it('is not fooled by check(): a face that has not loaded is not ready', async () => {
    assert.equal(ready(BOLD, 'Hi'), false);
    assert.equal(set.checks, 0);
    assert.equal(ready(BOLD, 'Hi'), false);
    assert.equal(set.loads.length, 1, 'one load however often the frame is drawn');
    set.loads[0].finish();
    await tick();
    assert.equal(arrivals, 1, 'the arrival asks for a repaint');
    assert.equal(ready(BOLD, 'Hi'), true);
  });

  it('is ready at once for other text in faces that are loaded: typing never flickers', async () => {
    ready(BOLD, 'H');
    set.loads[0].finish();
    await tick();
    for (const text of ['He', 'Hel', 'Hello, world', 'Hello\nworld'])
      assert.equal(ready(BOLD, text), true, text);
    assert.equal(ready(BOLD.replace('72px', '31.5px'), 'Other size'), true);
    assert.equal(set.loads.length, 1);
    assert.equal(arrivals, 1);
  });

  it('loads further subsets when the text first needs them', async () => {
    ready(BOLD, 'Hi');
    set.loads[0].finish();
    await tick();
    assert.equal(ready(BOLD, 'Hi Привет 🎬'), false);
    assert.deepEqual(set.loads[1].text, 'Hi Привет 🎬');
    set.loads[1].finish();
    await tick();
    assert.equal(ready(BOLD, 'Hi Привет 🎬'), true);
    assert.equal(ready(BOLD, 'Привет'), true);
  });

  it('gives up on a face that cannot be loaded, so the title still shows', async () => {
    const warn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    assert.equal(ready(BOLD, 'Hi'), false);
    set.loads[0].finish(false);
    await tick();
    console.warn = warn;
    assert.equal(arrivals, 1);
    assert.match(warnings[0], /could not load font/);
    assert.equal(ready(BOLD, 'Hi'), true, 'drawn with the fallback from now on');
    assert.equal(ready(BOLD, 'Other'), true, 'and not asked for again');
    assert.equal(set.loads.length, 1);
  });

  it('is ready when nothing bundled covers the text, and asks check() for foreign font values', () => {
    assert.equal(ready(BOLD, '漢字'), true);
    assert.equal(ready('italic small-caps 12px/2 Georgia', 'x'), true);
    assert.equal(set.checks, 1);
    assert.equal(set.loads.length, 0);
  });
});
