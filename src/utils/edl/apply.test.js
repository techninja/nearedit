import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectorResult } from './apply.js';
import { createEdl } from './factory.js';
import { addMarker } from './markers.js';
import { allClips } from './query.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const spans = (edl, trackId) => layout(edl)[trackId].map((s) => s.split(' ')[1]);

/** v1/a1: x 0–6 and y 6–12 as linked pairs; a2: music 0–12; markers at 3 and 9. */
const doc = () => {
  const pair = (id, start, end) => [
    testClip(id, start, end, { linkedClipId: `${id}_s` }),
    testClip(`${id}_s`, start, end, { linkedClipId: id }),
  ];
  const [x, xs] = pair('x', 0, 6);
  const [y, ys] = pair('y', 6, 12);
  const edl = testEdl({ v1: [x, y], a1: [xs, ys], a2: [testClip('music', 0, 12)] });
  return deepFreeze(addMarker(addMarker(edl, 3, { markerId: 'm3' }), 9, { markerId: 'm9' }));
};

/** A 4 s fragment: two linked A/V pairs (ids that collide with the document) and a marker. */
const fragment = (extra = {}) => ({
  tracks: [
    {
      type: 'video', index: 0, name: 'Video 1',
      clips: [
        { clipId: 'x', linkedClipId: 'x_s', sourceFile: '/m/n.mp4', sourceIn: 10, sourceOut: 12, timelineStart: 0, timelineEnd: 2, groupId: 'g' },
        { clipId: 'f2', linkedClipId: 'f2_s', sourceFile: '/m/n.mp4', sourceIn: 20, sourceOut: 22, timelineStart: 2, timelineEnd: 4, groupId: 'g' },
      ],
    },
    {
      type: 'audio', index: 0, name: 'Audio 1',
      clips: [
        { clipId: 'x_s', linkedClipId: 'x', sourceFile: '/m/n.mp4', sourceIn: 10, sourceOut: 12, timelineStart: 0, timelineEnd: 2 },
        { clipId: 'f2_s', linkedClipId: 'f2', sourceFile: '/m/n.mp4', sourceIn: 20, sourceOut: 22, timelineStart: 2, timelineEnd: 4 },
      ],
    },
  ],
  markers: [{ time: 1, label: 'beat' }],
  summary: '2 clips',
  notes: [],
  plan: {},
  ...extra,
});
const times = (edl) => edl.markers.map((marker) => marker.time);

describe('applyDirectorResult — modes', () => {
  it('append: the fragment starts where the timeline ends', () => {
    const out = assertValid(applyDirectorResult(doc(), fragment({ mode: 'append' })));
    assert.deepEqual(spans(out, 'v1'), ['0-6', '6-12', '12-14', '14-16']);
    assert.deepEqual(spans(out, 'a1'), ['0-6', '6-12', '12-14', '14-16']);
    assert.deepEqual(spans(out, 'a2'), ['0-12']);
    assert.deepEqual(times(out), [3, 9, 13]);
  });

  it('prepend: everything moves right by the fragment length', () => {
    const out = assertValid(applyDirectorResult(doc(), fragment({ mode: 'prepend' })));
    assert.deepEqual(spans(out, 'v1'), ['0-2', '2-4', '4-10', '10-16']);
    assert.deepEqual(spans(out, 'a2'), ['4-16']);
    assert.deepEqual(times(out), [1, 7, 13]);
    assert.equal(clipOf(out, 'x').timelineStart, 4, 'existing clips keep their ids');
  });

  it('insert: ripple-insert at `at`, splitting what crosses it', () => {
    const out = assertValid(applyDirectorResult(doc(), fragment({ mode: 'insert', at: 3 })));
    assert.deepEqual(spans(out, 'v1'), ['0-3', '3-5', '5-7', '7-10', '10-16']);
    assert.deepEqual(spans(out, 'a2'), ['0-3', '7-16']);
    assert.deepEqual(times(out), [4, 7, 13], 'the marker at the insert point moves with what follows');
    const tail = out.tracks[0].clips[3];
    assert.deepEqual([tail.sourceIn, tail.sourceOut], [3, 6]);
    assert.equal(tail.linkedClipId, out.tracks[1].clips[3].clipId);
  });

  it('range: replaces the range and ripples by the length difference', () => {
    const shorter = fragment({ mode: 'range', range: { start: 2, end: 10 } });
    const out = assertValid(applyDirectorResult(doc(), shorter));
    assert.deepEqual(spans(out, 'v1'), ['0-2', '2-4', '4-6', '6-8']);
    assert.deepEqual(spans(out, 'a2'), ['0-2', '6-8']);
    assert.deepEqual(times(out), [3], 'markers inside the range go, the fragment marker arrives');
    const longer = assertValid(applyDirectorResult(doc(), fragment({ mode: 'range', range: { start: 5, end: 6 } })));
    assert.deepEqual(spans(longer, 'v1'), ['0-5', '5-7', '7-9', '9-15']);
    assert.deepEqual(times(longer), [3, 6, 12]);
  });

  it('replace: the fragment becomes the timeline; tracks stay', () => {
    const out = assertValid(applyDirectorResult(doc(), fragment({ mode: 'replace' })));
    assert.deepEqual(layout(out).a2, []);
    assert.deepEqual(spans(out, 'v1'), ['0-2', '2-4']);
    assert.deepEqual(times(out), [1]);
    assert.deepEqual(out.tracks.map((t) => t.trackId), ['v1', 'a1', 'a2']);
  });

  it('falls back to append when the mode cannot be carried out', () => {
    for (const bad of [{ mode: 'insert' }, { mode: 'range', range: { start: 5, end: 5 } }, { mode: 'explode' }, {}]) {
      const out = assertValid(applyDirectorResult(doc(), fragment(bad)));
      assert.deepEqual(spans(out, 'v1'), ['0-6', '6-12', '12-14', '14-16']);
    }
    const start = doc();
    assert.equal(applyDirectorResult(start, null), start);
  });
});

describe('applyDirectorResult — fragment handling', () => {
  it('re-identifies clips, keeping links and groups inside the fragment', () => {
    const start = doc();
    const out = assertValid(applyDirectorResult(start, fragment({ mode: 'append' })));
    const ids = allClips(out).map(({ clip }) => clip.clipId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(clipOf(out, 'x'), clipOf(start, 'x'), 'the document clip called "x" is untouched');
    const [, , v3, v4] = out.tracks[0].clips;
    const [, , a3, a4] = out.tracks[1].clips;
    assert.deepEqual([v3.linkedClipId, a3.linkedClipId], [a3.clipId, v3.clipId]);
    assert.deepEqual([v4.linkedClipId, a4.linkedClipId], [a4.clipId, v4.clipId]);
    assert.ok(v3.groupId && v3.groupId === v4.groupId && v3.groupId !== 'g');
    assert.equal(v3.text.fontSize, 72, 'fragment clips are completed with defaults');
  });

  it('maps tracks by { type, index } and creates the missing ones', () => {
    const result = {
      mode: 'append',
      tracks: [
        { type: 'video', index: 2, name: 'B-roll', clips: [{ sourceFile: '/m/b.mp4', sourceIn: 0, sourceOut: 2, timelineStart: 0, timelineEnd: 2 }] },
        { type: 'audio', index: 1, clips: [{ sourceFile: '/m/sfx.wav', sourceIn: 0, sourceOut: 1, timelineStart: 0, timelineEnd: 1 }] },
      ],
    };
    const out = assertValid(applyDirectorResult(doc(), result));
    assert.deepEqual(out.tracks.map((t) => t.name), ['V1', 'Video 2', 'B-roll', 'A1', 'A2']);
    assert.deepEqual(spans(out, out.tracks[2].trackId), ['12-14']);
    assert.deepEqual(spans(out, 'a2'), ['0-12', '12-13']);
  });

  it('never writes to a locked track: its clips stay and the fragment gets a new track', () => {
    const start = deepFreeze(toggleTrackLock(doc(), 'v1'));
    const out = assertValid(applyDirectorResult(start, fragment({ mode: 'replace' })));
    assert.deepEqual(layout(out).v1, layout(start).v1);
    assert.equal(clipOf(out, 'x').linkedClipId, '', 'its replaced partner is gone, so the link is');
    assert.deepEqual({ ...clipOf(out, 'x'), linkedClipId: 'x_s' }, clipOf(start, 'x'));
    assert.deepEqual(spans(out, out.tracks[1].trackId), ['0-2', '2-4']);
    assert.deepEqual(layout(out).a1.length, 2);
    const inserted = assertValid(applyDirectorResult(start, fragment({ mode: 'insert', at: 3 })));
    assert.deepEqual(spans(inserted, 'v1'), ['0-6', '6-12'], 'locked tracks do not ripple');
    assert.deepEqual(spans(inserted, 'a1'), ['0-3', '3-5', '5-7', '7-10', '10-16']);
  });

  it('repairs a sloppy fragment: bad clips dropped, overlaps resolved, times snapped', () => {
    const result = {
      mode: 'replace',
      tracks: [{
        type: 'video',
        clips: [
          { clipId: 'a', sourceFile: '/m/a.mp4', sourceIn: 0, sourceOut: 3, timelineStart: 0, timelineEnd: 3.004 },
          { clipId: 'b', sourceFile: '/m/b.mp4', sourceIn: 0, sourceOut: 3, timelineStart: 2.5, timelineEnd: 5.5, linkedClipId: 'nobody' },
          { clipId: 'junk', timelineStart: 'x' },
          null,
        ],
      }],
      markers: [{ time: 'x' }, { time: 2.51, label: 'ok' }],
    };
    const out = assertValid(applyDirectorResult(createEdl(), result));
    assert.deepEqual(spans(out, 'v1'), ['0-3', '2.5-5.5']);
    const [a, b] = out.tracks[0].clips;
    assert.deepEqual([a.fadeOut, b.fadeIn, b.linkedClipId], [0.5, 0.5, '']);
    assert.deepEqual(out.markers.map((m) => [m.time, m.label]), [[2.5, 'ok']]);
  });

  it('an empty fragment in range mode is a ripple delete', () => {
    const out = assertValid(applyDirectorResult(doc(), { mode: 'range', range: { start: 2, end: 8 }, tracks: [] }));
    assert.deepEqual(spans(out, 'v1'), ['0-2', '2-6']);
    assert.deepEqual(times(out), [3]);
  });
});
