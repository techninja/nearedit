import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinKit,
  kitKey,
  normalizeKit,
  resolveElement,
  resolveKit,
} from '#utils/brand/index.js';
import {
  clipKind,
  insertElement,
  isElementClip,
  newClipIds,
  updateClip,
  updateElementSlots,
} from './index.js';
import { cutTimes } from './elementInsert.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const CLEAN = resolveKit(builtinKit('clean'));
const face = (file) => ({ family: 'Acme Sans', weight: 700, file });
/** A kit of one's own on top of clean. */
const acme = (rest = {}) =>
  resolveKit(
    normalizeKit({
      id: 'acme',
      extends: 'builtin:clean',
      tokens: {
        color: { primary: '#ff0066' },
        font: { heading: { family: 'Acme Sans', weight: 700 } },
      },
      fonts: [face('/kits/acme/Bold.woff2')],
      ...rest,
    }),
  );
const SLOTS = { name: 'Ada Lovelace', role: 'Mathematician' };
/** A document with footage and one element clip; returns it with the clip's id. */
function withElement(kit = CLEAN, id = 'lower-third', slots = SLOTS, opts = { time: 1 }) {
  const base = testEdl({ v1: [testClip('a', 0, 5), testClip('b', 5, 10)] });
  const edl = deepFreeze(insertElement(base, kit, id, slots, opts));
  return { edl, id: newClipIds(base, edl)[0], base };
}

describe('insertElement', () => {
  it('adds one clip that carries the design, the slots and the kit it came from', () => {
    const { edl, id } = withElement();
    const clip = clipOf(edl, id);
    assertValid(edl);
    assert.equal(clipKind(clip), 'element');
    assert.equal(isElementClip(clip), true);
    assert.deepEqual(clip.element.kit, { id: 'clean', key: kitKey(CLEAN) });
    assert.equal(clip.element.id, 'lower-third');
    assert.deepEqual(clip.element.slots, SLOTS);
    assert.equal(
      clip.element.design,
      resolveElement(CLEAN, 'lower-third'),
      'the design itself, tokens filled in',
    );
    assert.deepEqual(
      [clip.sourceFile, clip.placeholder, clip.label, clip.intent],
      ['', false, 'Ada Lovelace', 'title'],
    );
    assert.deepEqual([clip.sourceIn, clip.sourceOut], [0, 5]);
    assert.equal(edl.fonts, undefined, 'a kit of bundled fonts adds no font table');
  });

  it('places an overlay like a title: over the picture, for the element’s own length', () => {
    const { edl, id } = withElement();
    assert.deepEqual(Object.values(layout(edl)), [[`${id} 1-6`], ['a 0-5', 'b 5-10'], []]);
    const again = insertElement(edl, CLEAN, 'caption', { text: 'Hi' }, { time: 7, duration: 2 });
    assert.equal(again.tracks.length, 3, 'the front track is free there');
    const over = insertElement(edl, CLEAN, 'caption', { text: 'Hi' }, { time: 2 });
    assert.equal(over.tracks.length, 4, 'taken: a new track on top');
    assertValid(over);
  });

  it('gives a segment its own time: a gap opens and it fills the frame there', () => {
    const { edl, id } = withElement(CLEAN, 'chapter', { title: 'One', number: '01' }, { time: 5 });
    assertValid(edl);
    assert.deepEqual(layout(edl), { v1: ['a 0-5', `${id} 5-8`, 'b 8-13'], a1: [] });
    const cut = insertElement(
      testEdl({ v1: [testClip('a', 0, 10)] }),
      CLEAN,
      'intro',
      { title: 'T' },
      { time: 4, duration: 2 },
    );
    assert.equal(cut.tracks[0].clips.length, 3, 'footage under the place is cut and moves on');
    assert.deepEqual(
      cut.tracks[0].clips.map((c) => [c.timelineStart, c.timelineEnd]),
      [
        [0, 4],
        [4, 6],
        [6, 12],
      ],
    );
    const laid = withElement(CLEAN, 'chapter', { title: 'One' }, { time: 5, ripple: false });
    assert.deepEqual(
      Object.values(layout(laid.edl)),
      [[`${laid.id} 5-8`], ['a 0-5', 'b 5-10'], []],
      'or lies over it',
    );
  });

  it('centres a transition on the nearest cut, covering the frame on the cut', () => {
    const { edl, id } = withElement(CLEAN, 'stinger', {}, { time: 4.2 });
    assertValid(edl);
    const clip = clipOf(edl, id);
    assert.deepEqual([clip.timelineStart, clip.timelineEnd, clip.intent], [4.4, 5.6, 'transition']);
    assert.equal(
      clip.timelineStart + clip.element.design.cover * 1.2,
      5,
      'its cover moment is the cut',
    );
    const far = withElement(CLEAN, 'stinger', {}, { time: 9.9 });
    assert.equal(
      clipOf(far.edl, far.id).timelineStart,
      9.4,
      'the end of the last shot is a cut too',
    );
    const none = insertElement(testEdl(), CLEAN, 'stinger', {}, { time: 3 });
    assert.deepEqual(
      layout(none).v1.map((entry) => entry.split(' ')[1]),
      ['3-4.2'],
      'no cut: where it was asked',
    );
    const faded = testEdl({
      v1: [testClip('a', 0, 5, { fadeOut: 1 }), testClip('b', 4, 9, { fadeIn: 1 })],
    });
    assert.deepEqual(cutTimes(faded), [4.5, 9], 'the middle of a cross-fade');
    const titled = insertElement(
      testEdl({ v1: [testClip('a', 0, 6)] }),
      CLEAN,
      'title',
      { title: 'T' },
      { time: 1 },
    );
    assert.deepEqual(cutTimes(titled), [6], 'overlays are not cuts');
  });

  it('keeps only the slots the element has, and reads them safely', () => {
    const { edl, id } = withElement(CLEAN, 'lower-third', {
      name: 7,
      role: { evil: true },
      junk: 'x',
    });
    const odd = withElement(CLEAN, 'lower-third', {
      name: 'Ada',
      __proto__: { role: 'inherited' },
    });
    assert.deepEqual(clipOf(odd.edl, odd.id).element.slots, {}, 'only plain objects are read');
    assert.deepEqual(clipOf(edl, id).element.slots, { name: '7' });
    assert.equal(clipOf(edl, id).label, '7');
    const bare = withElement(CLEAN, 'bug', undefined);
    assert.deepEqual(clipOf(bare.edl, bare.id).element.slots, {});
    assert.equal(clipOf(bare.edl, bare.id).label, 'Logo bug');
  });

  it('changes nothing for an element the kit does not have', () => {
    const base = testEdl();
    assert.equal(insertElement(base, CLEAN, 'nope', {}), base);
    assert.equal(insertElement(base, null, 'title', {}), base);
  });

  it('lists the font files the design needs in the document', () => {
    const { edl } = withElement(acme());
    assertValid(edl);
    assert.deepEqual(edl.fonts, [
      { family: 'Acme Sans', weight: 700, style: 'normal', file: '/kits/acme/Bold.woff2' },
    ]);
    assert.equal(
      insertElement(edl, acme(), 'title', { title: 'T' }, { time: 7 }).fonts,
      edl.fonts,
      'once',
    );
  });
});

describe('updateElementSlots', () => {
  it('merges the patch in and leaves the design and the outside alone', () => {
    const { edl, id } = withElement();
    const next = updateElementSlots(edl, id, { role: 'Countess of Lovelace' });
    assertValid(next);
    const [before, after] = [clipOf(edl, id), clipOf(next, id)];
    assert.deepEqual(after.element.slots, { name: 'Ada Lovelace', role: 'Countess of Lovelace' });
    assert.equal(after.element.design, before.element.design);
    assert.equal(after.transform, before.transform);
    assert.equal(after.label, 'Ada Lovelace');
    assert.equal(
      clipOf(updateElementSlots(edl, id, { name: 'Augusta' }), id).label,
      'Augusta',
      'its own label follows',
    );
    const named = updateClip(edl, id, { label: 'Guest 1' });
    assert.equal(
      clipOf(updateElementSlots(named, id, { name: 'Augusta' }), id).label,
      'Guest 1',
      'a given one stays',
    );
    assert.deepEqual(clipOf(updateElementSlots(edl, id, { role: '' }), id).element.slots.role, '');
  });

  it('returns the same document when nothing changes or nothing can', () => {
    const { edl, id } = withElement();
    assert.equal(updateElementSlots(edl, id, { name: 'Ada Lovelace' }), edl);
    assert.equal(updateElementSlots(edl, id, null), edl);
    assert.equal(updateElementSlots(edl, 'a', { name: 'x' }), edl, 'not an element clip');
    assert.equal(updateElementSlots(edl, 'nope', { name: 'x' }), edl);
    const locked = {
      ...edl,
      tracks: edl.tracks.map((track, i) => (i ? track : { ...track, locked: true })),
    };
    assert.equal(updateElementSlots(locked, id, { name: 'x' }), locked);
  });
});
