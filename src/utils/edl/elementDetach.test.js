import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinKit,
  elementSpan,
  normalizeKit,
  resolveKit,
  sameElement,
} from '#utils/brand/index.js';
import {
  clipKind,
  copyClips,
  deleteClips,
  detachElement,
  duplicateClips,
  insertElement,
  insertTitle,
  isElementClip,
  moveClips,
  newClipIds,
  normalizeEdl,
  pasteClips,
  rippleDeleteRange,
  splitClips,
  syncFonts,
  updateClip,
  validateEdl,
} from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

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

describe('editing a document with element clips', () => {
  it('split: both halves keep the element and play as one run', () => {
    const { edl, id } = withElement();
    const cut = splitClips(edl, 3);
    assertValid(cut);
    const [left, right] = cut.tracks[0].clips;
    assert.deepEqual(
      [left.clipId, left.timelineEnd, right.timelineStart, right.timelineEnd],
      [id, 3, 3, 6],
    );
    assert.equal(right.element, left.element, 'the same block');
    assert.deepEqual(elementSpan(cut.tracks[0], left), { start: 1, end: 6 });
    assert.deepEqual(
      elementSpan(cut.tracks[0], right),
      { start: 1, end: 6 },
      'one entrance, one exit',
    );
    // Through a save the two halves are still one element.
    const loaded = normalizeEdl(JSON.parse(JSON.stringify(cut)));
    assert.equal(
      sameElement(loaded.tracks[0].clips[0].element, loaded.tracks[0].clips[1].element),
      true,
    );
    assert.deepEqual(elementSpan(loaded.tracks[0], loaded.tracks[0].clips[1]), {
      start: 1,
      end: 6,
    });
  });

  it('a piece that loses its neighbour, or moves away, arrives and leaves on its own again', () => {
    const { edl, id } = withElement();
    const cut = splitClips(edl, 3);
    const right = cut.tracks[0].clips[1];
    const alone = deleteClips(cut, [right.clipId]);
    assert.deepEqual(elementSpan(alone.tracks[0], clipOf(alone, id)), { start: 1, end: 3 });
    const apart = moveClips(cut, [right.clipId], { delta: 1 });
    assert.deepEqual(elementSpan(track(apart, id), clipOf(apart, id)), { start: 1, end: 3 });
    // Cut a stretch out of the middle: the pieces meet again and are one run.
    const tightened = rippleDeleteRange(edl, 2, 4);
    assertValid(tightened);
    const pieces = tightened.tracks[0].clips;
    assert.deepEqual(
      pieces.map((c) => [c.timelineStart, c.timelineEnd]),
      [
        [1, 2],
        [2, 4],
      ],
    );
    assert.deepEqual(elementSpan(tightened.tracks[0], pieces[1]), { start: 1, end: 4 });
    const renamed = {
      ...pieces[1],
      element: { ...pieces[1].element, slots: { name: 'Someone else' } },
    };
    assert.deepEqual(
      elementSpan({ clips: [pieces[0], renamed] }, renamed),
      { start: 2, end: 4 },
      'another element is another run',
    );
  });

  it('copy, paste and duplicate carry the element and the fonts it needs', () => {
    const { edl, id } = withElement(ACME);
    const pasted = pasteClips(testEdl(), copyClips(edl, [id]), { time: 2 });
    assertValid(pasted);
    const [copy] = pasted.tracks.flatMap((t) => t.clips);
    assert.notEqual(copy.clipId, id);
    assert.deepEqual(copy.element, clipOf(edl, id).element);
    assert.deepEqual(pasted.fonts, edl.fonts, 'the other document learns the font');
    const twice = duplicateClips(edl, [id]);
    assertValid(twice);
    assert.equal(twice.tracks.flatMap((t) => t.clips).filter(isElementClip).length, 2);
    assert.equal(syncFonts(edl), edl, 'already in step: the same document');
  });

  it('a title may be set in a font of the document’s own', () => {
    const { edl } = withElement(ACME);
    const titled = insertTitle(edl, {
      text: { content: 'Hello', fontFamily: 'Acme Sans' },
      time: 7,
    });
    const [id] = newClipIds(edl, titled);
    assertValid(titled);
    assert.equal(clipOf(titled, id).text.fontFamily, 'Acme Sans');
    assert.equal(
      clipOf(normalizeEdl(JSON.parse(JSON.stringify(titled))), id).text.fontFamily,
      'Acme Sans',
    );
    assert.equal(
      clipOf(updateClip(titled, id, { text: { fontFamily: 'Nobody Sans' } }), id).text.fontFamily,
      'Acme Sans',
    );
    assert.equal(
      clipOf(updateClip(titled, id, { text: { fontFamily: 'Caveat' } }), id).text.fontFamily,
      'Caveat',
    );
    const without = { ...titled, fonts: undefined };
    assert.deepEqual(problems(without).filter((path) => path.endsWith('fontFamily')).length, 1);
    assert.equal(
      clipOf(normalizeEdl({ ...JSON.parse(JSON.stringify(titled)), fonts: [] }), id).text
        .fontFamily,
      'sans-serif',
    );
    assert.deepEqual(
      problems({
        ...titled,
        fonts: [{ family: 'Inter', weight: 400, style: 'normal', file: 'x.ttf' }],
      })[0],
      'fonts',
    );
    assert.deepEqual(problems({ ...titled, fonts: [] })[0], 'fonts', 'an empty table is no table');
  });
});

describe('detachElement', () => {
  it('turns the clip into the ordinary clips that draw it, grouped, in the same order', () => {
    const { edl, id } = withElement();
    const next = detachElement(edl, id);
    assertValid(next);
    const made = newClipIds(edl, next).map((clipId) => clipOf(next, clipId));
    assert.equal(clipOf(next, id), undefined);
    assert.equal(made.some(isElementClip), false);
    assert.deepEqual([...new Set(made.map((clip) => clipKind(clip)))].sort(), [
      'generator',
      'title',
    ]);
    assert.equal(new Set(made.map((clip) => clip.groupId)).size, 1);
    assert.ok(made[0].groupId);
    assert.ok(made.every((clip) => clip.timelineStart >= 1 && clip.timelineEnd <= 6));
    const order = next.tracks
      .filter((t) => t.type === 'video')
      .map((t) => t.clips.map((c) => c.label)[0]);
    assert.deepEqual(
      order,
      ['role', 'name', 'bar', 'plate', undefined].map((label, i) => (i === 4 ? order[4] : label)),
    );
    assert.equal(next.tracks.at(-2).clips.length, 2, 'the footage is where it was');
    assert.ok(
      made.every(
        (clip) => Math.abs(clip.timelineStart * 30 - Math.round(clip.timelineStart * 30)) < 1e-9,
      ),
    );
  });

  it('carries the clip’s position, size and opacity onto the pieces', () => {
    const { edl, id } = withElement();
    const plain = detachElement(edl, id);
    const moved = detachElement(
      updateClip(edl, id, {
        transform: { x: 100, y: -50, scaleX: 0.5, scaleY: 0.5, opacity: 0.8 },
      }),
      id,
    );
    const name = (doc) => doc.tracks.flatMap((t) => t.clips).find((clip) => clip.label === 'name');
    const [a, b] = [name(plain), name(moved)];
    assert.deepEqual(
      [b.transform.x, b.transform.y],
      [a.transform.x * 0.5 + 100, a.transform.y * 0.5 - 50],
    );
    assert.deepEqual([b.transform.scaleX, b.transform.opacity], [0.5, 0.8]);
  });

  it('keeps a brand font valid on the titles it leaves, and uses free tracks above', () => {
    const { edl, id } = withElement(ACME);
    const next = detachElement(edl, id, {
      measure: (text, style) => text.length * style.fontSize * 0.5,
    });
    assertValid(next);
    const titles = next.tracks.flatMap((t) => t.clips).filter((clip) => clip.text.content);
    assert.ok(titles.some((clip) => clip.text.fontFamily === 'Acme Sans'));
    assert.deepEqual(next.fonts, edl.fonts);
    const roomy = {
      ...edl,
      tracks: [{ ...edl.tracks[0], trackId: 'free', clips: [] }, ...edl.tracks],
    };
    const used = detachElement(roomy, id);
    assert.ok(used.tracks.find((t) => t.trackId === 'free').clips.length > 0);
    assert.equal(used.tracks.length, detachElement(edl, id).tracks.length);
  });

  it('changes nothing for what is not an element clip, is locked, or draws nothing', () => {
    const { edl, id } = withElement();
    assert.equal(detachElement(edl, 'a'), edl);
    assert.equal(detachElement(edl, 'nope'), edl);
    const locked = { ...edl, tracks: edl.tracks.map((t, i) => (i ? t : { ...t, locked: true })) };
    assert.equal(detachElement(locked, id), locked);
    const empty = withElement(CLEAN, 'lower-third', {});
    assert.equal(detachElement(empty.edl, empty.id), empty.edl, 'no name: nothing to draw');
    const cut = splitClips(edl, 3);
    assert.deepEqual(
      layout(detachElement(cut, id)).v1,
      layout(cut).v1,
      'the footage is left alone',
    );
  });
});
