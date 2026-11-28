import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, normalizeKit, resolveKit } from '#utils/brand/index.js';
import {
  clipKind,
  insertElement,
  isElementClip,
  isTimed,
  newClipIds,
  normalizeEdl,
  toSavedDocument,
  trimClipStart,
  updateClip,
  validateEdl,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const CLEAN = resolveKit(builtinKit('clean'));
const ACME = resolveKit(
  normalizeKit({
    id: 'acme',
    tokens: { font: { heading: { family: 'Acme Sans', weight: 700 } } },
    fonts: [{ family: 'Acme Sans', weight: 700, file: '/kits/acme/Bold.woff2' }],
  }),
);
const SLOTS = { name: 'Ada Lovelace', role: 'Mathematician' };
function withElement(kit = CLEAN, id = 'lower-third', slots = SLOTS, opts = { time: 1 }) {
  const base = testEdl({ v1: [testClip('a', 0, 5), testClip('b', 5, 10)] });
  const edl = deepFreeze(insertElement(base, kit, id, slots, opts));
  return { edl, id: newClipIds(base, edl)[0], base };
}
const problems = (edl) => validateEdl(edl).problems.map((problem) => problem.path);
const track = (edl, clipId) =>
  edl.tracks.find((t) => t.clips.some((clip) => clip.clipId === clipId));

describe('the element field in a document', () => {
  it('survives saving and loading unchanged', () => {
    const { edl } = withElement(ACME);
    const loaded = normalizeEdl(JSON.parse(JSON.stringify(toSavedDocument(edl))));
    assert.deepEqual(loaded, edl);
    assert.deepEqual(loaded.fonts, edl.fonts);
    assert.equal(
      normalizeEdl(testEdl()).fonts,
      undefined,
      'a document without fonts has no such field',
    );
  });

  it('is read safely: bounded, only what an element block has', () => {
    const { edl, id } = withElement();
    const raw = JSON.parse(JSON.stringify(edl));
    const clip = raw.tracks[0].clips[0];
    clip.sourceFile = '/etc/passwd';
    clip.element.extra = 'x';
    clip.element.kit = { id: '../x', key: 'nope', more: 1 };
    clip.element.slots = { name: 'A'.repeat(9999), 'bad key': 'x', n: 7, o: {} };
    clip.element.design.layers.push(
      { type: 'hologram' },
      ...Array(200).fill({ type: 'shape', w: 1 }),
    );
    clip.element.design.layers[0].evil = '<script>';
    const read = clipOf(normalizeEdl(raw), id);
    assertValid(normalizeEdl(raw));
    assert.equal(read.sourceFile, '', 'an element clip names no file');
    assert.deepEqual(read.element.kit, { id: '', key: '' });
    assert.deepEqual(Object.keys(read.element), ['kit', 'id', 'slots', 'design']);
    assert.deepEqual(
      [
        read.element.slots.name.length,
        read.element.slots.n,
        Object.keys(read.element.slots).length,
      ],
      [2000, '7', 2],
    );
    assert.equal(read.element.design.layers.length, 47, 'cut to 48, and what is no layer dropped');
    assert.equal('evil' in read.element.design.layers[0], false);
    for (const element of [null, 7, 'x', [], {}, { design: null }, { design: 'x' }]) {
      const junk = JSON.parse(JSON.stringify(edl));
      junk.tracks[0].clips[0].element = element;
      const cleaned = normalizeEdl(junk);
      assertValid(cleaned);
      assert.equal(
        cleaned.tracks.some((t) => t.clips.some(isElementClip)),
        false,
      );
    }
  });

  it('is checked by validateEdl, and a clip is never two of web, music and element', () => {
    const { edl } = withElement();
    const broken = (change) => {
      const copy = JSON.parse(JSON.stringify(edl));
      change(copy.tracks[0].clips[0]);
      return problems(copy);
    };
    assert.deepEqual(
      broken((clip) => (clip.element.kit.key = 'short')),
      ['tracks[0].clips[0].element.kit.key'],
    );
    assert.deepEqual(
      broken((clip) => (clip.element.design.layers[0].nope = 1)),
      ['tracks[0].clips[0].element.design.layers[0].nope'],
    );
    assert.deepEqual(
      broken((clip) => (clip.element = { slots: {} })),
      ['tracks[0].clips[0].element'],
    );
    assert.deepEqual(broken((clip) => (clip.music = { song: {}, key: '' })).slice(-1), [
      'tracks[0].clips[0].element',
    ]);
    const both = JSON.parse(JSON.stringify(edl));
    both.tracks[0].clips[0].web = { recipe: { url: 'https://example.com' } };
    const read = normalizeEdl(both).tracks[0].clips[0];
    assert.deepEqual(
      [Boolean(read.web), read.element],
      [true, undefined],
      'on load the web block wins',
    );
  });

  it('cannot be written by updateClip, which still edits everything outside', () => {
    const { edl, id } = withElement();
    const next = updateClip(edl, id, {
      element: { id: 'title' },
      transform: { y: -80 },
      label: 'Guest',
    });
    assert.equal(clipOf(next, id).element, clipOf(edl, id).element);
    assert.deepEqual([clipOf(next, id).transform.y, clipOf(next, id).label], [-80, 'Guest']);
    assert.equal(updateClip(edl, id, { element: null }), edl);
    assert.equal(
      clipKind(clipOf(updateClip(edl, id, { text: { content: 'x' }, sourceFile: '/m/a.mp4' }), id)),
      'element',
    );
  });

  it('has an unbounded source, like a title', () => {
    const { edl, id } = withElement();
    assert.equal(isTimed(clipOf(edl, id), edl.tracks[0]), false);
    const longer = trimClipStart(edl, id, 0.5);
    assertValid(longer);
    assert.deepEqual([clipOf(longer, id).timelineStart, clipOf(longer, id).sourceIn], [0.5, -0.5]);
  });
});
