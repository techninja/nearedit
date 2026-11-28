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
  addEffect,
  elementClips,
  insertElement,
  newClipIds,
  restyle,
  setClipFades,
  setKeyframe,
  staleElements,
  updateClip,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

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

describe('restyle and staleElements', () => {
  it('replaces the inside from the kit and never touches the outside or the slots', () => {
    const { edl: plain, id } = withElement();
    let edl = updateClip(plain, id, {
      transform: { x: 40, y: -120, scaleX: 0.9 },
      blendMode: 'screen',
      color: '#123456',
    });
    edl = setClipFades(edl, id, { fadeIn: 0.5, fadeOut: 0.25 });
    edl = addEffect(edl, { clipId: id }, 'blur', { params: { radius: 4 } });
    edl = deepFreeze(setKeyframe(edl, id, 'transform.opacity', 2, 0.5));
    const kit = acme();
    assert.deepEqual(
      staleElements(edl, kit).map((ref) => [ref.clip.clipId, ref.reason]),
      [[id, 'outdated']],
    );
    const next = restyle(edl, kit);
    assertValid(next);
    const [before, after] = [clipOf(edl, id), clipOf(next, id)];
    assert.deepEqual(after.element.kit, { id: 'acme', key: kitKey(kit) });
    assert.equal(after.element.design, resolveElement(kit, 'lower-third'));
    assert.equal(after.element.slots, before.element.slots, 'what was filled in is kept');
    const { element: _new, ...outside } = after;
    const { element: _old, ...was } = before;
    for (const key of Object.keys(was))
      assert.equal(outside[key], was[key], `${key} is the editor's`);
    assert.deepEqual(staleElements(next, kit), []);
    assert.equal(restyle(next, kit), next, 'up to date: the same document');
    assert.equal(next.tracks[1], edl.tracks[1], 'untouched tracks keep their identity');
  });

  it('follows the font table: files of the new designs in, files nothing uses any more out', () => {
    const { edl, id } = withElement(acme());
    const own = {
      ...edl,
      fonts: [...edl.fonts, { family: 'Mine', weight: 400, style: 'normal', file: '/my/font.ttf' }],
    };
    const moved = restyle(own, acme({ fonts: [face('/kits/acme/Bold-v2.woff2')] }));
    assert.deepEqual(
      moved.fonts.map((f) => f.file),
      ['/kits/acme/Bold-v2.woff2', '/my/font.ttf'],
    );
    const back = restyle(own, CLEAN);
    assert.deepEqual(
      back.fonts.map((f) => f.family),
      ['Mine'],
      'an entry nobody dropped is never removed',
    );
    assert.equal(restyle(edl, CLEAN).fonts, undefined, 'none left: no table');
    assertValid(restyle(edl, CLEAN));
    assert.equal(clipOf(restyle(edl, CLEAN), id).element.design.fonts, undefined);
  });

  it('keeps a slot the new element no longer has, unused', () => {
    const { edl, id } = withElement();
    const nameOnly = { ...builtinKit('clean').elements['lower-third'], slots: { name: {} } };
    const kit = acme({ elements: { 'lower-third': nameOnly } });
    const next = restyle(edl, kit);
    assert.deepEqual(clipOf(next, id).element.slots, SLOTS);
    assert.deepEqual(clipOf(next, id).element.design.slots, ['name']);
    assertValid(next);
  });

  it('leaves a clip whose element the kit no longer has, and reports it', () => {
    const custom = acme({
      elements: { badge: { slots: {}, layers: [{ type: 'shape', w: 5, h: 5, fill: '#ffffff' }] } },
    });
    const { edl, id } = withElement(custom, 'badge', {});
    const kit = acme();
    assert.deepEqual(
      staleElements(edl, kit).map((ref) => ref.reason),
      ['missing'],
    );
    assert.equal(restyle(edl, kit), edl);
    assert.equal(clipOf(restyle(edl, kit), id).element.kit.key, kitKey(custom));
  });

  it('restyles only the clips named, and never one on a locked track', () => {
    const { edl: one, id } = withElement();
    const edl = insertElement(one, CLEAN, 'caption', { text: 'Hi' }, { time: 7 });
    const [other] = newClipIds(one, edl);
    const kit = acme();
    const next = restyle(edl, kit, [other]);
    assert.deepEqual(
      staleElements(next, kit).map((ref) => ref.clip.clipId),
      [id],
    );
    assert.deepEqual(
      elementClips(next)
        .map((ref) => ref.clip.clipId)
        .sort(),
      [id, other].sort(),
    );
    const locked = {
      ...edl,
      tracks: edl.tracks.map((track, i) => (i ? track : { ...track, locked: true })),
    };
    assert.equal(restyle(locked, kit), locked);
  });
});
