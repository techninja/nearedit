import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addRegion,
  moveRegion,
  regionsOf,
  removeRegion,
  renameRegion,
  resizeRegion,
  retimeRegions,
  updateRegion,
} from './regions.js';
import { assertValid, deepFreeze, testClip, testEdl } from './testkit.js';

const F = 1 / 30;
const base = () => deepFreeze(testEdl({ v1: [testClip('a', 0, 4)] }));
const spans = (edl) => regionsOf(edl).map((r) => [r.regionId, r.start, r.end, r.label]);
const two = () => {
  const one = addRegion(base(), 10, 14, { regionId: 'chorus', label: 'Chorus' });
  return deepFreeze(addRegion(one, 2, 5, { regionId: 'verse', label: 'Verse' }));
};

describe('regions', () => {
  it('has none until one is added, and keeps them sorted by start', () => {
    assert.deepEqual(regionsOf(base()), []);
    assert.deepEqual(regionsOf(undefined), []);
    assert.deepEqual(spans(two()), [
      ['verse', 2, 5, 'Verse'],
      ['chorus', 10, 14, 'Chorus'],
    ]);
    assertValid(two());
  });

  it('adds on the frame grid, in either order, at least one frame long', () => {
    const doc = addRegion(base(), 6.01, 2.02);
    const [region] = regionsOf(doc);
    assert.equal(region.start, Math.round(2.02 * 30) / 30);
    assert.equal(region.end, Math.round(6.01 * 30) / 30);
    assert.match(region.regionId, /^r_/);
    assert.equal(region.label, '');
    assert.equal(region.color, '');
    const point = regionsOf(addRegion(base(), 3, 3))[0];
    assert.ok(Math.abs(point.end - point.start - F) < 1e-9);
    assert.equal(regionsOf(addRegion(base(), -4, -1))[0].start, 0);
    const doc0 = base();
    assert.equal(addRegion(doc0, NaN, 2), doc0, 'no times, no region');
  });

  it('gives a clashing id a fresh one', () => {
    const doc = addRegion(two(), 20, 22, { regionId: 'verse' });
    const ids = regionsOf(doc).map((r) => r.regionId);
    assert.equal(new Set(ids).size, 3);
  });

  it('renames and recolours without touching the rest', () => {
    const doc = two();
    const renamed = renameRegion(doc, 'verse', 'Verse 1');
    assert.equal(regionsOf(renamed)[0].label, 'Verse 1');
    assert.equal(regionsOf(renamed)[1], regionsOf(doc)[1], 'the other region is shared');
    assert.equal(renamed.tracks, doc.tracks);
    assert.equal(regionsOf(updateRegion(doc, 'verse', { color: '#ff0000' }))[0].color, '#ff0000');
    assert.equal(renameRegion(doc, 'verse', 'Verse'), doc, 'no change, same document');
    assert.equal(renameRegion(doc, 'nope', 'x'), doc);
  });

  it('moves keeping the length, never before 0, and re-sorts', () => {
    const moved = moveRegion(two(), 'verse', 20);
    assert.deepEqual(spans(moved), [
      ['chorus', 10, 14, 'Chorus'],
      ['verse', 20, 23, 'Verse'],
    ]);
    assert.deepEqual(spans(moveRegion(two(), 'verse', -3))[0], ['verse', 0, 3, 'Verse']);
    const doc = two();
    assert.equal(moveRegion(doc, 'verse', NaN), doc);
    assert.equal(moveRegion(doc, 'verse', 2), doc, 'already there');
  });

  it('resizes one end, stopping a frame short of the other', () => {
    const doc = two();
    assert.deepEqual(spans(resizeRegion(doc, 'verse', 'end', 8))[0], ['verse', 2, 8, 'Verse']);
    assert.deepEqual(spans(resizeRegion(doc, 'verse', 'start', 1))[0], ['verse', 1, 5, 'Verse']);
    const crossed = regionsOf(resizeRegion(doc, 'verse', 'start', 9))[0];
    assert.ok(Math.abs(crossed.start - (5 - F)) < 1e-9 && crossed.end === 5);
    const collapsed = regionsOf(resizeRegion(doc, 'verse', 'end', 0))[0];
    assert.ok(Math.abs(collapsed.end - (2 + F)) < 1e-9 && collapsed.start === 2);
  });

  it('removes', () => {
    assert.deepEqual(spans(removeRegion(two(), 'verse')), [['chorus', 10, 14, 'Chorus']]);
    const doc = two();
    assert.equal(removeRegion(doc, 'nope'), doc);
  });

  it('follows a ripple: shifts, shrinks, and drops what was removed', () => {
    const doc = two();
    const pushed = retimeRegions(doc, (t) => (t >= 4 ? t + 2 : t));
    assert.deepEqual(spans(pushed), [
      ['verse', 2, 7, 'Verse'],
      ['chorus', 12, 16, 'Chorus'],
    ]);
    // Remove 3..12: the verse loses its tail, the chorus its head.
    const cut = retimeRegions(doc, (t) => (t >= 12 ? t - 9 : t > 3 ? 3 : t));
    assert.deepEqual(spans(cut), [
      ['verse', 2, 3, 'Verse'],
      ['chorus', 3, 5, 'Chorus'],
    ]);
    const gone = retimeRegions(doc, (t) => (t >= 9 ? t - 8 : t > 1 ? 1 : t));
    assert.deepEqual(
      spans(gone).map((s) => s[0]),
      ['chorus'],
    );
    assert.equal(
      retimeRegions(doc, (t) => t),
      doc,
    );
    assert.deepEqual(spans(retimeRegions(doc, (t) => (t < 6 ? null : t))).length, 1);
  });
});
