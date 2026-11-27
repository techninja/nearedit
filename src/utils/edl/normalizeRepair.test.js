import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEdl } from './normalize.js';
import { assertValid, clipOf, layout, testClip, testEdl } from './testkit.js';

describe('normalizeEdl — garbage in, valid document out', () => {
  it('survives anything that is not a document', () => {
    for (const junk of [
      null,
      undefined,
      42,
      'edl',
      [],
      {},
      { tracks: 'no' },
      { tracks: [null, 7, 'x'] },
    ]) {
      const edl = assertValid(normalizeEdl(junk));
      assert.deepEqual(
        edl.tracks.map((t) => [t.trackId, t.type, t.name]),
        [
          ['v1', 'video', 'Video 1'],
          ['a1', 'audio', 'Audio 1'],
        ],
      );
    }
  });

  it('repairs head fields', () => {
    const edl = normalizeEdl({ version: 1, fps: -5, resolution: 'huge', markers: 'none' });
    assert.deepEqual([edl.version, edl.fps, edl.resolution, edl.markers], [2, 30, '1920x1080', []]);
    assert.equal(normalizeEdl({ fps: '25' }).fps, 25);
  });

  it('drops clips with unusable times and repairs the rest', () => {
    const edl = assertValid(
      normalizeEdl({
        tracks: [
          {
            type: 'video',
            clips: [
              'nope',
              { clipId: 'nan', timelineStart: 'soon', timelineEnd: 4 },
              { clipId: 'backwards', timelineStart: 5, timelineEnd: 2, sourceFile: 'a.mp4' },
              { clipId: 'tiny', timelineStart: 1, timelineEnd: 1.001, sourceFile: 'a.mp4' },
              {
                clipId: 'early',
                sourceFile: 'a.mp4',
                sourceIn: 1,
                sourceOut: 5,
                timelineStart: -2,
                timelineEnd: 2,
              },
              {
                clipId: 'strings',
                sourceFile: 'b.mp4',
                sourceIn: '2',
                sourceOut: '4',
                timelineStart: '10.01',
                timelineEnd: '12',
                fadeIn: 9,
                fadeOut: 'x',
                volume: 11,
              },
              {
                clipId: 'long',
                sourceFile: 'c.mp4',
                sourceIn: 0,
                sourceOut: 2,
                timelineStart: 20,
                timelineEnd: 30,
              },
              {
                clipId: 'photo',
                sourceFile: 'd.png',
                sourceIn: -4,
                timelineStart: 40,
                timelineEnd: 50,
              },
            ],
          },
        ],
      }),
    );
    assert.deepEqual(layout(edl)[edl.tracks[0].trackId], [
      'early 0-2',
      'strings 10-12',
      'long 20-22',
      'photo 40-50',
    ]);
    assert.deepEqual(
      [clipOf(edl, 'early').sourceIn, clipOf(edl, 'early').sourceOut],
      [3, 5],
      'trimmed to time 0',
    );
    const s = clipOf(edl, 'strings');
    assert.deepEqual([s.sourceIn, s.sourceOut, s.fadeIn, s.fadeOut, s.volume], [2, 4, 2, 0, 2]);
    assert.equal(
      clipOf(edl, 'long').sourceOut,
      2,
      'speed is 1: the shorter of span and source wins',
    );
    assert.equal(clipOf(edl, 'photo').sourceIn, 0);
  });

  it('resolves overlaps: cross-fade when possible, otherwise the later clip wins', () => {
    const edl = assertValid(
      normalizeEdl(
        testEdl({
          v1: [
            testClip('a', 0, 5),
            testClip('b', 4, 9),
            testClip('c', 8.5, 20),
            testClip('in', 12, 13),
            testClip('d', 4.5, 8.8),
          ],
        }),
      ),
    );
    // d lands inside b and on the a/b cross-fade, so it overwrites both (a
    // sliver of b survives in front of it); c cross-fades with d; "in" splits c.
    assert.deepEqual(
      layout(edl).v1.map((s) => s.replace(/^clip_\w+/, 'piece')),
      ['a 0-4', 'b 4-4.5', 'd 4.5-8.8', 'c 8.5-12', 'in 12-13', 'piece 13-20'],
    );
    assert.ok(Math.abs(clipOf(edl, 'd').fadeOut - 0.3) < 1e-9);
    assert.ok(Math.abs(clipOf(edl, 'c').fadeIn - 0.3) < 1e-9);
  });

  it('de-duplicates ids and repairs links', () => {
    const edl = assertValid(
      normalizeEdl(
        testEdl({
          v1: [
            testClip('x', 0, 1, { linkedClipId: 'y' }),
            testClip('x', 2, 3, { linkedClipId: 'gone' }),
            testClip('', 4, 5),
            testClip('self', 6, 7, { linkedClipId: 'self' }),
          ],
          a1: [testClip('y', 0, 1), testClip('z', 2, 3, { linkedClipId: 'y' })],
          a2: [],
          'a2 ': [],
        }),
      ),
    );
    const ids = edl.tracks.flatMap((t) => t.clips.map((c) => c.clipId));
    assert.equal(new Set(ids).size, 6);
    assert.ok(ids.every(Boolean));
    assert.equal(clipOf(edl, 'y').linkedClipId, 'x', 'one-way link completed');
    assert.equal(clipOf(edl, 'z').linkedClipId, '', 'the target was taken');
    assert.equal(clipOf(edl, 'self').linkedClipId, '');
    assert.equal(edl.tracks[0].clips[1].linkedClipId, '', 'dangling link dropped');
  });

  it('snaps to the frame grid and keeps invariant 1', () => {
    const edl = assertValid(
      normalizeEdl({
        fps: 25,
        tracks: [
          {
            type: 'video',
            clips: [
              {
                clipId: 'a',
                sourceFile: 'a.mp4',
                sourceIn: 1.234,
                sourceOut: 3.25,
                timelineStart: 0.013,
                timelineEnd: 2.03,
              },
              {
                clipId: 'b',
                sourceFile: 'b.mp4',
                sourceIn: 0,
                sourceOut: 1,
                timelineStart: 2.03,
                timelineEnd: 3.03,
              },
            ],
          },
        ],
      }),
    );
    const [a, b] = edl.tracks[0].clips;
    assert.deepEqual(
      [a.timelineStart, a.timelineEnd, b.timelineStart],
      [0, 2.04, 2.04],
      'abutting clips still abut',
    );
    assert.ok(Math.abs(a.sourceOut - a.sourceIn - 2.04) < 1e-9);
  });
});
