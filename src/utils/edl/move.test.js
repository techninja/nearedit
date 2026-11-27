import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from './markers.js';
import { moveClips } from './move.js';
import { snapMove } from './snap.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

/** Two A/V pairs on v1/a1, a title on v2, a grouped pair of stills on v3. */
const doc = () =>
  deepFreeze(
    testEdl({
      v3: [
        testClip('s1', 2, 4, { sourceFile: '/m/s1.png', groupId: 'g' }),
        testClip('s2', 6, 8, { sourceFile: '/m/s2.png', groupId: 'g' }),
      ],
      v2: [testClip('title', 1, 3, { sourceFile: '', text: { content: 'Hi' } })],
      v1: [
        testClip('p', 0, 4, { linkedClipId: 'p_a' }),
        testClip('q', 6, 10, { linkedClipId: 'q_a' }),
      ],
      a1: [
        testClip('p_a', 0, 4, { linkedClipId: 'p' }),
        testClip('q_a', 6, 10, { linkedClipId: 'q' }),
      ],
      a2: [],
    }),
  );

describe('moveClips — time', () => {
  it('moves a clip with its linked partner', () => {
    const out = assertValid(moveClips(doc(), ['q'], { delta: 2 }));
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 8-12']);
    assert.deepEqual(layout(out).a1, ['p_a 0-4', 'q_a 8-12']);
    assert.equal(clipOf(out, 'q').sourceIn, 0, 'a move never changes the source range');
    assert.equal(clipOf(out, 'q').sourceOut, 4);
  });

  it('linked: false moves the clip alone (the link stays)', () => {
    const out = assertValid(moveClips(doc(), ['q'], { delta: 2, linked: false }));
    assert.deepEqual(layout(out).a1, ['p_a 0-4', 'q_a 6-10']);
    assert.equal(clipOf(out, 'q').linkedClipId, 'q_a');
  });

  it('moves grouped clips together, unless grouped: false', () => {
    const together = moveClips(doc(), ['s1'], { delta: 10 });
    assert.deepEqual(layout(together).v3, ['s1 12-14', 's2 16-18']);
    const alone = moveClips(doc(), ['s1'], { delta: 10, grouped: false });
    assert.deepEqual(layout(alone).v3, ['s2 6-8', 's1 12-14']);
  });

  it('clamps at time 0 as a block, keeping the relative layout', () => {
    const out = assertValid(moveClips(doc(), ['s1'], { delta: -30 }));
    assert.deepEqual(layout(out).v3, ['s1 0-2', 's2 4-6']);
  });

  it('snaps the delta to the frame grid of the document', () => {
    const at25 = deepFreeze(testEdl({ v1: [testClip('a', 0, 2)] }, { fps: 25 }));
    const out = moveClips(at25, ['a'], { delta: 1.03 });
    assert.equal(clipOf(out, 'a').timelineStart, 1.04);
    assert.equal(clipOf(out, 'a').timelineEnd, 3.04);
  });

  it('ignores unknown ids and returns the same document when nothing moves', () => {
    const start = doc();
    assert.equal(moveClips(start, ['nope'], { delta: 3 }), start);
    assert.equal(moveClips(start, ['p'], { delta: 0.001 }), start);
    assert.equal(moveClips(start, ['p'], { delta: -5 }), start, 'already at 0');
  });

  it('never moves a clip on a locked track; its unlocked partner still moves', () => {
    const start = deepFreeze(toggleTrackLock(doc(), 'a1'));
    assert.equal(moveClips(start, ['q_a'], { delta: 2 }), start);
    const out = assertValid(moveClips(start, ['q'], { delta: 2 }));
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 8-12']);
    assert.equal(out.tracks[3], start.tracks[3], 'the locked track is untouched');
  });

  it('applies the snap option and reports the same result as snapMove', () => {
    const start = deepFreeze(addMarker(doc(), 12.5));
    const snap = { threshold: 0.25, playhead: 30 };
    // Dragging q by 2.4 puts its end at 12.4, within reach of the marker at 12.5.
    const out = moveClips(start, ['q'], { delta: 2.4, snap });
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 8.5-12.5']);
    const guide = snapMove(start, ['q', 'q_a'], 2.4, { ...snap, anchorId: 'q' });
    assert.equal(guide.target.type, 'marker');
    assert.equal(guide.edge, 'end');
    assert.ok(Math.abs(guide.delta - 2.5) < 1e-9);
    // Clip edges of clips that are not moving are candidates too (s2 ends at 8).
    const edge = snapMove(start, ['q', 'q_a'], 1.9, { ...snap, anchorId: 'q' });
    assert.deepEqual([edge.target.type, edge.target.id, edge.target.edge], ['clip', 's2', 'end']);
  });
});

describe('moveClips — between tracks', () => {
  it('moves the anchor to another track of its type; the audio partner stays put', () => {
    const out = assertValid(moveClips(doc(), ['q'], { delta: 0, toTrackId: 'v2' }));
    assert.deepEqual(layout(out).v2, ['title 1-3', 'q 6-10']);
    assert.deepEqual(layout(out).v1, ['p 0-4']);
    assert.deepEqual(layout(out).a1, ['p_a 0-4', 'q_a 6-10']);
  });

  it('moves an audio clip between audio tracks while its picture stays', () => {
    const out = assertValid(moveClips(doc(), ['q_a'], { delta: 1, toTrackId: 'a2' }));
    assert.deepEqual(layout(out).a2, ['q_a 7-11']);
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 7-11']);
  });

  it('ignores a target track of the other type', () => {
    const out = moveClips(doc(), ['q'], { delta: 1, toTrackId: 'a2' });
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 7-11']);
    assert.deepEqual(layout(out).a2, []);
  });

  it('keeps the vertical arrangement of a multi-track selection inside the lane', () => {
    // title is on v2 (row 1), p on v1 (row 2). Asking the title to go to v1
    // would push p off the bottom, so nothing changes track.
    const down = moveClips(doc(), ['title', 'p'], { delta: 1, anchorId: 'title', toTrackId: 'v1' });
    assert.deepEqual(layout(down).v2, ['title 2-4']);
    assert.deepEqual(layout(down).v1, ['p 1-5', 'q 6-10']);
    const up = moveClips(doc(), ['title', 'p'], { anchorId: 'title', toTrackId: 'v3', linked: false });
    assert.deepEqual(layout(up).v3, ['title 1-3', 's1 2-4', 's2 6-8']);
    assert.deepEqual(layout(up).v2, ['p 0-4']);
    assertValid(up);
  });

  it('refuses to drop onto a locked track but still applies the time delta', () => {
    const start = deepFreeze(toggleTrackLock(doc(), 'v2'));
    const out = assertValid(moveClips(start, ['q'], { delta: 1, toTrackId: 'v2' }));
    assert.deepEqual(layout(out).v2, ['title 1-3']);
    assert.deepEqual(layout(out).v1, ['p 0-4', 'q 7-11']);
  });

  it('resolves overlaps on the track it lands on', () => {
    const out = assertValid(moveClips(doc(), ['q'], { delta: -4, toTrackId: 'v2' }));
    assert.deepEqual(layout(out).v2, ['title 1-3', 'q 2-6']);
    assert.equal(clipOf(out, 'title').fadeOut, 1);
    assert.equal(clipOf(out, 'q').fadeIn, 1);
    // The partner moved in time on its own track and now cross-fades there.
    assert.deepEqual(layout(out).a1, ['p_a 0-4', 'q_a 2-6']);
    assert.equal(clipOf(out, 'q_a').fadeIn, 2);
  });
});
