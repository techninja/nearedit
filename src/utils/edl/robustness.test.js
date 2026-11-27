import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, deepFreeze, testClip, testEdl } from './testkit.js';

const doc = () =>
  deepFreeze(
    E.addMarker(
      testEdl({
        v1: [
          testClip('a', 0, 5, { fadeOut: 1, linkedClipId: 'a_s' }),
          testClip('b', 4, 9, { fadeIn: 1 }),
        ],
        a1: [testClip('a_s', 0, 5, { linkedClipId: 'a' })],
      }),
      3,
      { markerId: 'm' },
    ),
  );

const BAD = [NaN, Infinity, -Infinity, undefined, null, 'soon', {}];

describe('operations shrug off nonsense arguments', () => {
  it('a non-finite number never corrupts the document', () => {
    for (const bad of BAD) {
      const start = doc();
      const results = [
        E.moveClips(start, ['b'], { delta: bad }),
        E.moveClips(start, ['b'], { delta: 1, snap: { threshold: bad, playhead: bad } }),
        E.trimClipStart(start, 'a', bad),
        E.trimClipEnd(start, 'b', bad, { ripple: true }),
        E.slipClip(start, 'b', bad),
        E.splitClips(start, bad),
        E.setClipFades(start, 'b', { fadeIn: bad, fadeOut: bad }),
        E.updateClip(start, 'b', { volume: bad, transform: { x: bad, opacity: bad } }),
        E.rippleInsert(start, bad, 2),
        E.rippleInsert(start, 2, bad),
        E.rippleDeleteRange(start, bad, 4),
        E.rippleDeleteRange(start, 1, bad),
        E.closeGaps(start, 'v1', { from: bad }),
        E.addMarker(start, bad),
        E.moveMarker(start, 'm', bad),
        E.moveTrack(start, 'v1', bad),
        E.setTrackVolume(start, 'a1', bad),
        E.pasteClips(start, E.copyClips(start, ['b']), { time: bad }),
        E.duplicateClips(start, ['b'], { time: bad }),
        E.insertMedia(start, { filePath: '/m/x.mp4', type: 'video', duration: bad }, { time: bad }),
        E.insertMedia(
          start,
          { filePath: '/m/x.mp4', type: 'video', duration: 4 },
          { sourceIn: bad },
        ),
        E.insertTitle(start, { text: 'T', time: bad, duration: bad }),
        E.applyDirectorResult(start, { mode: 'insert', at: bad, tracks: [] }),
        E.applyDirectorResult(start, {
          mode: 'range',
          range: { start: bad, end: bad },
          tracks: bad,
        }),
      ];
      results.forEach((result, i) => {
        try {
          assertValid(result);
        } catch (error) {
          throw new Error(`call ${i} with ${String(bad)}: ${error.message}`);
        }
      });
    }
  });

  it('unknown ids, empty selections and missing options are no-ops', () => {
    const start = doc();
    const same = [
      E.moveClips(start, [], { delta: 3 }),
      E.moveClips(start, ['ghost']),
      E.trimClipEnd(start, 'ghost', 3),
      E.slipClip(start, 'ghost', 1),
      E.splitClips(start, 2, { clipIds: [] }),
      E.deleteClips(start, []),
      E.rippleDelete(start, ['ghost']),
      E.setClipFades(start, 'ghost', { fadeIn: 1 }),
      E.setClipFades(start, 'b'),
      E.updateClip(start, 'ghost', { label: 'x' }),
      E.updateClip(start, 'b', null),
      E.groupClips(start, ['ghost', 'b']),
      E.unlinkClips(start, ['b']),
      E.closeGaps(start, 'ghost'),
      E.removeTrack(start, 'ghost'),
      E.renameTrack(start, 'ghost', 'x'),
      E.updateTrack(start, 'v1'),
      E.removeMarker(start, 'ghost'),
      E.pasteClips(start, E.copyClips(start, [])),
      E.duplicateClips(start, []),
      E.applyDirectorResult(start, undefined),
    ];
    same.forEach((result, i) => assert.equal(result, start, `call ${i} should return its input`));
  });

  it('query-style helpers answer sensibly for nonsense', () => {
    const start = doc();
    assert.deepEqual(E.expandSelection(start, undefined), []);
    assert.deepEqual(E.clipsInRange(start, NaN, NaN), []);
    assert.equal(E.snapTime(start, NaN).snapped, false);
    assert.equal(E.snapMove(start, [], 1).delta, 1);
    assert.equal(E.copyClips(start, null), null);
    assert.equal(E.validateEdl(undefined).valid, false);
  });
});
