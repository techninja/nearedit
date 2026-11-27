import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipsInRange,
  expandSelection,
  groupClips,
  linkClips,
  newClipIds,
  ungroupClips,
  unlinkClips,
} from './selection.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const doc = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 0, 4, { linkedClipId: 'a_s', groupId: 'g1' }),
        testClip('b', 5, 8, { groupId: 'g1' }),
        testClip('c', 9, 12, { linkedClipId: 'c_s' }),
      ],
      a1: [
        testClip('a_s', 0, 4, { linkedClipId: 'a' }),
        testClip('c_s', 9, 12, { linkedClipId: 'c', groupId: 'g2' }),
      ],
      a2: [testClip('m', 0, 30, { groupId: 'g2' })],
    }),
  );

describe('expandSelection', () => {
  it('adds linked partners and group members, transitively, given ids first', () => {
    assert.deepEqual(expandSelection(doc(), ['b']), ['b', 'a', 'a_s']);
    assert.deepEqual(expandSelection(doc(), ['c']).sort(), ['c', 'c_s', 'm']);
  });

  it('accepts a single id, an array or a Set', () => {
    const expected = expandSelection(doc(), ['a'], { grouped: false });
    assert.deepEqual(expandSelection(doc(), 'a', { grouped: false }), expected);
    assert.deepEqual(expandSelection(doc(), new Set(['a']), { grouped: false }), expected);
    assert.deepEqual(expandSelection(doc(), null), []);
  });

  it('can leave links or groups out', () => {
    assert.deepEqual(expandSelection(doc(), ['a'], { grouped: false }), ['a', 'a_s']);
    assert.deepEqual(expandSelection(doc(), ['a'], { linked: false }), ['a', 'b']);
    assert.deepEqual(expandSelection(doc(), ['a'], { linked: false, grouped: false }), ['a']);
  });

  it('drops unknown ids, duplicates and clips on locked tracks', () => {
    assert.deepEqual(expandSelection(doc(), ['ghost', 'c', 'c'], { grouped: false }), ['c', 'c_s']);
    const locked = toggleTrackLock(doc(), 'a1');
    assert.deepEqual(expandSelection(locked, ['a', 'a_s']), ['a', 'b']);
  });
});

describe('groupClips / ungroupClips', () => {
  it('puts clips in one new group', () => {
    const out = assertValid(groupClips(doc(), ['b', 'm']));
    const groupId = clipOf(out, 'b').groupId;
    assert.ok(groupId && groupId !== 'g1' && groupId !== 'g2');
    assert.equal(clipOf(out, 'm').groupId, groupId);
    assert.equal(clipOf(out, 'a').groupId, 'g1', 'clips that were not given keep their group');
  });

  it('needs at least two unlocked clips', () => {
    const start = doc();
    assert.equal(groupClips(start, ['b']), start);
    assert.equal(groupClips(start, ['b', 'ghost']), start);
    const locked = deepFreeze(toggleTrackLock(start, 'a2'));
    assert.equal(groupClips(locked, ['b', 'm']), locked);
  });

  it('ungroup dissolves the whole group of each given clip', () => {
    const out = ungroupClips(doc(), ['b']);
    assert.deepEqual([clipOf(out, 'a').groupId, clipOf(out, 'b').groupId], ['', '']);
    assert.equal(clipOf(out, 'm').groupId, 'g2');
    const start = doc();
    assert.equal(ungroupClips(start, ['c']), start, 'c is in no group');
  });
});

describe('linkClips / unlinkClips', () => {
  it('links two clips and releases their previous partners (invariant 5)', () => {
    const out = assertValid(linkClips(doc(), 'a', 'c_s'));
    assert.deepEqual(
      [clipOf(out, 'a').linkedClipId, clipOf(out, 'c_s').linkedClipId],
      ['c_s', 'a'],
    );
    assert.deepEqual([clipOf(out, 'a_s').linkedClipId, clipOf(out, 'c').linkedClipId], ['', '']);
  });

  it('refuses self-links, missing clips and locked clips', () => {
    const start = doc();
    assert.equal(linkClips(start, 'b', 'b'), start);
    assert.equal(linkClips(start, 'b', 'ghost'), start);
    const locked = deepFreeze(toggleTrackLock(start, 'a2'));
    assert.equal(linkClips(locked, 'b', 'm'), locked);
  });

  it('unlink clears both sides', () => {
    const out = assertValid(unlinkClips(doc(), ['a_s', 'b']));
    assert.deepEqual([clipOf(out, 'a').linkedClipId, clipOf(out, 'a_s').linkedClipId], ['', '']);
    assert.equal(clipOf(out, 'c').linkedClipId, 'c_s');
  });
});

describe('clipsInRange (marquee) and newClipIds', () => {
  it('returns clips that intersect the range, in track then time order', () => {
    assert.deepEqual(clipsInRange(doc(), 3, 6), ['a', 'b', 'a_s', 'm']);
    assert.deepEqual(clipsInRange(doc(), 6, 3, ['v1']), ['a', 'b'], 'either order, some tracks');
  });

  it('touching edges do not count; a zero-width range selects what is under it', () => {
    assert.deepEqual(clipsInRange(doc(), 4, 5, ['v1']), []);
    assert.deepEqual(clipsInRange(doc(), 5, 5, ['v1']), ['b']);
    assert.deepEqual(clipsInRange(doc(), 8, 8, ['v1']), []);
  });

  it('skips locked tracks', () => {
    assert.deepEqual(clipsInRange(toggleTrackLock(doc(), 'a2'), 3, 6), ['a', 'b', 'a_s']);
  });

  it('newClipIds lists what an operation created', () => {
    const before = doc();
    const after = {
      ...before,
      tracks: [{ ...before.tracks[0], clips: [testClip('new', 20, 21)] }],
    };
    assert.deepEqual(newClipIds(before, after), ['new']);
    assert.deepEqual(newClipIds(before, before), []);
  });
});
