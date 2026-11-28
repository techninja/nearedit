import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectorResult, toggleTrackLock, validateEdl } from '#utils/edl/index.js';
import { clipOf, testClip, testEdl } from '#utils/edl/testkit.js';
import { applyDirected } from './applyResult.js';
import { keepLockedLinks, lockedPartners } from '#utils/edl/lockedLinks.js';

/** A linked picture and sound (`v`, `a`) and a second pair after them (`v2`, `a2`). */
function pairs() {
  return testEdl({
    v1: [testClip('v', 0, 4, { linkedClipId: 'a' }), testClip('v2', 6, 9, { linkedClipId: 'a2' })],
    a1: [testClip('a', 0, 4, { linkedClipId: 'v' }), testClip('a2', 6, 9, { linkedClipId: 'v2' })],
  });
}
const lock = (/** @type {any} */ edl, /** @type {number} */ index) =>
  toggleTrackLock(edl, edl.tracks[index].trackId);
/** A whole-timeline result as an in-place action sends it: locked tracks travel empty. */
function replaceOf(/** @type {any} */ edl, change = (/** @type {any} */ clip) => clip) {
  const count = { video: 0, audio: 0 };
  const tracks = edl.tracks.map((/** @type {any} */ track) => ({
    ...{ type: track.type, index: count[track.type]++, name: track.name, trackId: track.trackId },
    locked: Boolean(track.locked),
    clips: track.locked
      ? []
      : track.clips.flatMap((/** @type {any} */ clip) => change({ ...clip })),
  }));
  return { mode: 'replace', tracks, markers: [], summary: 'done', notes: [] };
}
const links = (/** @type {any} */ edl) =>
  Object.fromEntries(
    edl.tracks
      .flatMap((/** @type {any} */ t) => t.clips)
      .map((/** @type {any} */ c) => [c.clipId, c.linkedClipId]),
  );

test('a link across a lock is kept by the merge itself, and so by the panel', () => {
  for (const index of [0, 1]) {
    const edl = lock(pairs(), index);
    assert.deepEqual([...lockedPartners(edl)].length, 2);
    const result = replaceOf(edl);
    const bare = applyDirectorResult(edl, result);
    assert.deepEqual(links(bare), { v: 'a', a: 'v', v2: 'a2', a2: 'v2' }, 'the merge by itself');
    assert.deepEqual(validateEdl(bare).problems, []);
    const out = applyDirected(edl, result);
    assert.deepEqual(links(out), { v: 'a', a: 'v', v2: 'a2', a2: 'v2' });
    assert.deepEqual(validateEdl(out).problems, []);
    // Nothing else was asked for: the document comes back itself, and there is no step to undo.
    assert.equal(out, edl);
  }
});

test('a clip that moved keeps its partner on a locked track, as it does in the editor', () => {
  const edl = lock(pairs(), 1);
  const later = (/** @type {any} */ clip) =>
    clip.clipId === 'v2' ? { ...clip, timelineStart: 10, timelineEnd: 13 } : clip;
  const out = applyDirected(edl, replaceOf(edl, later));
  assert.deepEqual([clipOf(out, 'v2').timelineStart, clipOf(out, 'a2').timelineStart], [10, 6]);
  assert.deepEqual(links(out), { v: 'a', a: 'v', v2: 'a2', a2: 'v2' });
  assert.equal(out.tracks[1], edl.tracks[1], 'the locked track is the very same');
});

test('a clip the result cut up, unlinked or dropped lets the link go — on the locked side too', () => {
  const edl = lock(pairs(), 1);
  const cut = (/** @type {any} */ clip) =>
    clip.clipId !== 'v'
      ? clip
      : [
          { ...clip, timelineEnd: 2, sourceOut: 2, linkedClipId: '' },
          { ...clip, clipId: 'v_b', timelineStart: 2, sourceIn: 2, linkedClipId: '' },
        ];
  assert.deepEqual(links(applyDirected(edl, replaceOf(edl, cut))), {
    ...{ v: '', v_b: '', a: '' },
    ...{ v2: 'a2', a2: 'v2' },
  });
  const dropped = applyDirected(
    edl,
    replaceOf(edl, (clip) => (clip.clipId === 'v' ? [] : clip)),
  );
  assert.deepEqual(links(dropped), { a: '', v2: 'a2', a2: 'v2' });
  assert.deepEqual(validateEdl(dropped).problems, []);
});

test('only a whole-timeline result is looked at, and only links the document had', () => {
  const edl = lock(pairs(), 1);
  const next = applyDirectorResult(edl, replaceOf(edl));
  assert.equal(keepLockedLinks(edl, { ...replaceOf(edl), mode: 'append' }, next), next);
  assert.equal(keepLockedLinks(edl, null, next), next);
  assert.equal(keepLockedLinks(pairs(), replaceOf(pairs()), next), next, 'no locked track');
  // A result cannot invent a link to a clip on a locked track.
  const free = lock(testEdl({ v1: [testClip('v', 0, 4)], a1: [testClip('a', 0, 4)] }), 1);
  const claims = replaceOf(free, (clip) => ({ ...clip, linkedClipId: 'a' }));
  assert.deepEqual(links(applyDirected(free, claims)), { v: '', a: '' });
});
